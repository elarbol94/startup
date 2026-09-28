import { and, eq, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { wikiOfficeDocuments, wikiOfficeOperations, wikiOfficeSessions, wikiOfficeVersions, wikiPages } from "@/db/schema";
import { COMMAND_KEY_MISSING, COMMAND_NO_CHANGES, COMMAND_OK, sendCommand, type CommandResult } from "./command";
import type { OfficeConfig } from "./config";
import { withPageOfficeLock } from "./page-lock";
import { ACTIVE_OPERATION_STATES, activeOperation, OfficeConflictError } from "./sessions";
import { commitHeadVersion, prepareDocx, readVersionFile } from "./store";

/**
 * Restore and "save version now" as persisted operations. The page lock is
 * held only to start and to finish; commands and waiting happen without it,
 * so the callbacks they wait for can be processed meanwhile.
 */
export const RESTORE_DEADLINE_MS = 60_000;
export const CHECKPOINT_DEADLINE_MS = 20_000;
const POLL_MS = 500;
const COMMAND_ATTEMPTS = 3;

export type OperationDeps = {
  command: (payload: Parameters<typeof sendCommand>[1]) => Promise<CommandResult>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
};

export function defaultOperationDeps(config: OfficeConfig): OperationDeps {
  return { command: (payload) => sendCommand(config, payload), sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now: () => Date.now() };
}

type Operation = typeof wikiOfficeOperations.$inferSelect;

const readOperation = (id: string) => db.select().from(wikiOfficeOperations).where(eq(wikiOfficeOperations.id, id)).get()!;
const readSession = (key: string | null) => key ? db.select().from(wikiOfficeSessions).where(eq(wikiOfficeSessions.key, key)).get() ?? null : null;
const isActive = (operation: Operation) => (ACTIVE_OPERATION_STATES as readonly string[]).includes(operation.state);

function fail(id: string, reason: NonNullable<Operation["failureReason"]>) {
  db.update(wikiOfficeOperations).set({ state: "failed", failureReason: reason })
    .where(and(eq(wikiOfficeOperations.id, id), inArray(wikiOfficeOperations.state, [...ACTIVE_OPERATION_STATES]))).run();
  return readOperation(id);
}

function insertOperation(values: typeof wikiOfficeOperations.$inferInsert) {
  try {
    return db.insert(wikiOfficeOperations).values(values).returning().get();
  } catch (error) {
    // The partial unique index allows one active operation per page.
    if (String(error).includes("UNIQUE")) throw new OfficeConflictError("operationInProgress");
    throw error;
  }
}

// --- Restore ---------------------------------------------------------------

export async function startRestore(pageId: string, targetVersionId: string, userId: string, deps: OperationDeps) {
  const target = db.select({ id: wikiOfficeVersions.id }).from(wikiOfficeVersions)
    .where(and(eq(wikiOfficeVersions.id, targetVersionId), eq(wikiOfficeVersions.pageId, pageId))).get();
  if (!target) throw new Error("Version not found");
  const operation = await withPageOfficeLock(pageId, () => db.transaction(() => {
    const active = activeOperation(pageId);
    if (active) {
      if (active.kind === "restore" && active.targetVersionId === targetVersionId) return active;
      throw new OfficeConflictError("operationInProgress");
    }
    const office = db.select().from(wikiOfficeDocuments).where(eq(wikiOfficeDocuments.pageId, pageId)).get();
    if (!office?.headVersionId) throw new OfficeConflictError("notOffice");
    return insertOperation({
      pageId, kind: "restore", sessionKey: office.currentSessionKey, targetVersionId,
      expectedHeadId: office.headVersionId, deadlineAt: new Date(deps.now() + RESTORE_DEADLINE_MS), requestedBy: userId,
    });
  }, { behavior: "immediate" }));
  return runRestore(operation.id, deps);
}

/** Resumable: safe to call again after a restart for an active operation. */
export async function runRestore(operationId: string, deps: OperationDeps): Promise<Operation> {
  let operation = readOperation(operationId);
  while (isActive(operation)) {
    if (deps.now() > operation.deadlineAt.getTime()) return fail(operationId, "timeout");
    const session = readSession(operation.sessionKey);
    const users: string[] = session ? JSON.parse(session.connectedUserIdsJson) : [];
    const outgoingStored = !session || session.state === "finalized" || session.state === "superseded"
      || (session.state === "idle" && users.length === 0 && !unsavedError(session));
    if (outgoingStored) return finishRestore(operationId, deps);
    if (session.state === "idle" && users.length === 0) return fail(operationId, "saveError");

    if (operation.state === "created") {
      const result = await dropAll(session.key, deps).catch((error: unknown) => ({ error: -1, message: String(error) }));
      const attempts = operation.commandAttempts + 1;
      const sent = result.error === COMMAND_OK || result.error === COMMAND_KEY_MISSING;
      db.update(wikiOfficeOperations).set({ commandAttempts: attempts, lastCommandResult: JSON.stringify(result), ...(sent ? { state: "sent" as const } : {}) })
        .where(and(eq(wikiOfficeOperations.id, operationId), eq(wikiOfficeOperations.state, "created"))).run();
      if (!sent && attempts >= COMMAND_ATTEMPTS) return fail(operationId, "dropError");
      if (!sent) await deps.sleep(POLL_MS * attempts);
    } else {
      await deps.sleep(POLL_MS);
    }
    operation = readOperation(operationId);
  }
  return operation;
}

function unsavedError(session: NonNullable<ReturnType<typeof readSession>>) {
  return session.lastError === "saveError" && (session.lastErrorAt?.getTime() ?? 0) >= session.headLastsave;
}

async function dropAll(key: string, deps: OperationDeps): Promise<CommandResult> {
  const info = await deps.command({ c: "info", key });
  if (info.error !== COMMAND_OK) return info;
  const users = info.users ?? [];
  if (!users.length) return { error: COMMAND_OK };
  return deps.command({ c: "drop", key, users });
}

function finishRestore(operationId: string, deps: OperationDeps) {
  const initial = readOperation(operationId);
  return withPageOfficeLock(initial.pageId, () => {
    const operation = readOperation(operationId);
    if (!isActive(operation)) return operation;
    if (deps.now() > operation.deadlineAt.getTime()) return fail(operationId, "timeout");
    const office = db.select().from(wikiOfficeDocuments).where(eq(wikiOfficeDocuments.pageId, operation.pageId)).get();
    const head = office?.headVersionId ? db.select().from(wikiOfficeVersions).where(eq(wikiOfficeVersions.id, office.headVersionId)).get() : null;
    const headOk = head && (head.id === operation.expectedHeadId || (operation.sessionKey && head.sessionKey === operation.sessionKey));
    if (!office || !headOk) return fail(operationId, "conflict");
    const target = db.select().from(wikiOfficeVersions).where(eq(wikiOfficeVersions.id, operation.targetVersionId!)).get();
    if (!target) return fail(operationId, "conflict");
    const prepared = prepareDocx(readVersionFile(target.attachmentId));
    const actor = operation.requestedBy ?? office.updatedBy ?? db.select({ id: wikiPages.updatedBy }).from(wikiPages).where(eq(wikiPages.id, operation.pageId)).get()!.id;
    commitHeadVersion(operation.pageId, prepared, "restore", actor, {
      inTransaction: (versionId) => {
        if (operation.sessionKey) db.update(wikiOfficeSessions).set({ state: "superseded", finalizedAt: new Date() }).where(eq(wikiOfficeSessions.key, operation.sessionKey)).run();
        db.update(wikiOfficeDocuments).set({ currentSessionKey: null }).where(eq(wikiOfficeDocuments.pageId, operation.pageId)).run();
        db.update(wikiOfficeOperations).set({ state: "done", resultVersionId: versionId }).where(eq(wikiOfficeOperations.id, operationId)).run();
      },
    });
    return readOperation(operationId);
  });
}

// --- Checkpoint ("save version now") ---------------------------------------

export async function startCheckpoint(pageId: string, userId: string, deps: OperationDeps): Promise<Operation> {
  const operation = await withPageOfficeLock(pageId, () => db.transaction(() => {
    if (activeOperation(pageId)) throw new OfficeConflictError("operationInProgress");
    const office = db.select().from(wikiOfficeDocuments).where(eq(wikiOfficeDocuments.pageId, pageId)).get();
    if (!office?.headVersionId) throw new OfficeConflictError("notOffice");
    return insertOperation({
      pageId, kind: "checkpoint", sessionKey: office.currentSessionKey, expectedHeadId: office.headVersionId,
      deadlineAt: new Date(deps.now() + CHECKPOINT_DEADLINE_MS), requestedBy: userId,
    });
  }, { behavior: "immediate" }));
  return runCheckpoint(operation.id, deps);
}

/** Success is reported only when the status-6 callback carrying this operation id was committed. */
export async function runCheckpoint(operationId: string, deps: OperationDeps): Promise<Operation> {
  let operation = readOperation(operationId);
  if (operation.state === "created") {
    const session = readSession(operation.sessionKey);
    if (!session || (session.state !== "open" && session.state !== "idle")) return fail(operationId, "nothingNew");
    const result = await deps.command({ c: "forcesave", key: session.key, userdata: operationId }).catch((error: unknown) => ({ error: -1, message: String(error) }));
    if (result.error === COMMAND_NO_CHANGES || result.error === COMMAND_KEY_MISSING) {
      db.update(wikiOfficeOperations).set({ lastCommandResult: JSON.stringify(result) }).where(eq(wikiOfficeOperations.id, operationId)).run();
      return fail(operationId, "nothingNew");
    }
    if (result.error !== COMMAND_OK) {
      db.update(wikiOfficeOperations).set({ lastCommandResult: JSON.stringify(result) }).where(eq(wikiOfficeOperations.id, operationId)).run();
      return fail(operationId, "saveError");
    }
    db.update(wikiOfficeOperations).set({ state: "sent", commandAttempts: 1, lastCommandResult: JSON.stringify(result) })
      .where(and(eq(wikiOfficeOperations.id, operationId), eq(wikiOfficeOperations.state, "created"))).run();
    operation = readOperation(operationId);
  }
  while (isActive(operation)) {
    if (deps.now() > operation.deadlineAt.getTime()) return fail(operationId, "timeout");
    await deps.sleep(POLL_MS);
    operation = readOperation(operationId);
  }
  return operation;
}

// --- Recovery --------------------------------------------------------------

/** Startup: resume active operations, or terminate those past their deadline. */
export function recoverOfficeOperations(deps: OperationDeps) {
  const now = new Date(deps.now());
  db.update(wikiOfficeOperations).set({ state: "failed", failureReason: "timeout" })
    .where(and(inArray(wikiOfficeOperations.state, [...ACTIVE_OPERATION_STATES]), lt(wikiOfficeOperations.deadlineAt, now))).run();
  const active = db.select().from(wikiOfficeOperations).where(inArray(wikiOfficeOperations.state, [...ACTIVE_OPERATION_STATES])).all();
  return Promise.all(active.map((operation) => (operation.kind === "restore" ? runRestore : runCheckpoint)(operation.id, deps)
    .catch((error: unknown) => console.warn(JSON.stringify({ event: "office_operation_recovery_failed", id: operation.id, reason: String(error) })))));
}
