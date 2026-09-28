import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { wikiOfficeDocuments, wikiOfficeOperations, wikiOfficeSessions, wikiPages } from "@/db/schema";
import type { OfficeConfig } from "./config";
import { downloadFromDocServer } from "./office-http";
import { withPageOfficeLock } from "./page-lock";
import { ACTIVE_OPERATION_STATES } from "./sessions";
import { commitCallbackSave, prepareDocx } from "./store";

/**
 * Document-server callback payload (verified JWT `payload` claim).
 * api.onlyoffice.com → "Callback handler".
 */
export const callbackPayloadSchema = z.object({
  key: z.string().min(1).max(128),
  status: z.number().int().min(0).max(7),
  url: z.string().max(4096).optional(),
  changesurl: z.string().max(4096).optional(),
  history: z.object({ serverVersion: z.string().optional(), changes: z.array(z.unknown()).optional() }).passthrough().optional(),
  users: z.array(z.string()).optional(),
  actions: z.array(z.object({ type: z.number(), userid: z.string() })).optional(),
  lastsave: z.string().optional(),
  forcesavetype: z.number().optional(),
  userdata: z.string().max(200).optional(),
}).passthrough();
export type CallbackPayload = z.infer<typeof callbackPayloadSchema>;

export type CallbackDeps = {
  download: (url: string) => Promise<Buffer>;
};

export function defaultCallbackDeps(config: OfficeConfig): CallbackDeps {
  return { download: (url) => downloadFromDocServer(url, config) };
}

function lastsaveMs(payload: CallbackPayload) {
  const parsed = payload.lastsave ? Date.parse(payload.lastsave) : NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
}

/** The author of a save: the last change's user, else the last user in the session. */
function saveAuthor(payload: CallbackPayload) {
  const changes = (payload.history?.changes ?? []) as Array<{ user?: { id?: unknown } }>;
  const last = changes.at(-1)?.user?.id;
  return typeof last === "string" ? last : payload.users?.at(-1) ?? null;
}

function ensureSession(pageId: string, key: string) {
  const session = db.select().from(wikiOfficeSessions).where(and(eq(wikiOfficeSessions.key, key), eq(wikiOfficeSessions.pageId, pageId))).get();
  if (session) return session;
  // A signed callback for a key we no longer know (e.g. after a database
  // restore): keep its content as a branch instead of dropping it.
  const office = db.select({ head: wikiOfficeDocuments.headVersionId }).from(wikiOfficeDocuments).where(eq(wikiOfficeDocuments.pageId, pageId)).get();
  if (!office?.head) return null;
  return db.insert(wikiOfficeSessions).values({ key, pageId, baseVersionId: office.head, state: "superseded" }).onConflictDoNothing().returning().get() ?? null;
}

export type CallbackOutcome = { ok: true; versionId?: string; advanced?: boolean } | { ok: false; reason: string };

/**
 * Applies one callback under the page lock. Throws when the state could not be
 * persisted, so the route answers `{"error":1}` and the server retries.
 */
export function handleCallback(pageId: string, payload: CallbackPayload, deps: CallbackDeps): Promise<CallbackOutcome> {
  return withPageOfficeLock(pageId, async () => {
    const page = db.select({ id: wikiPages.id }).from(wikiPages).where(eq(wikiPages.id, pageId)).get();
    if (!page) return { ok: false, reason: "unknownPage" };
    const session = ensureSession(pageId, payload.key);
    if (!session) return { ok: false, reason: "unknownSession" };
    const now = new Date();
    const live = session.state === "open" || session.state === "idle";

    switch (payload.status) {
      case 1: {
        db.update(wikiOfficeSessions).set({
          ...(live ? { state: "open" as const } : {}),
          connectedUserIdsJson: JSON.stringify(payload.users ?? []),
          lastCallbackAt: now,
        }).where(eq(wikiOfficeSessions.key, session.key)).run();
        return { ok: true };
      }
      case 2:
      case 6: {
        if (!payload.url) throw new Error("Save callback without url");
        const prepared = prepareDocx(await deps.download(payload.url));
        const changes = payload.changesurl ? await deps.download(payload.changesurl) : null;
        const result = commitCallbackSave({
          pageId, sessionKey: session.key, status: payload.status, lastsaveMs: lastsaveMs(payload), prepared, changes,
          historyJson: payload.history ? JSON.stringify(payload.history) : null, userId: saveAuthor(payload),
        });
        db.transaction(() => {
          if (payload.status === 2 && live) {
            db.update(wikiOfficeSessions).set({ state: "finalized", finalizedAt: now, connectedUserIdsJson: "[]", lastCallbackAt: now }).where(eq(wikiOfficeSessions.key, session.key)).run();
            db.update(wikiOfficeDocuments).set({ currentSessionKey: null }).where(and(eq(wikiOfficeDocuments.pageId, pageId), eq(wikiOfficeDocuments.currentSessionKey, session.key))).run();
          } else {
            db.update(wikiOfficeSessions).set({ lastCallbackAt: now }).where(eq(wikiOfficeSessions.key, session.key)).run();
          }
          if (payload.status === 6 && payload.userdata) {
            db.update(wikiOfficeOperations).set({ state: "done", resultVersionId: result.versionId, lastCommandResult: result.advanced ? "stored" : "branch" })
              .where(and(eq(wikiOfficeOperations.id, payload.userdata), eq(wikiOfficeOperations.pageId, pageId), eq(wikiOfficeOperations.kind, "checkpoint"), inArray(wikiOfficeOperations.state, [...ACTIVE_OPERATION_STATES]))).run();
          }
        }, { behavior: "immediate" });
        return { ok: true, versionId: result.versionId, advanced: result.advanced };
      }
      case 3:
      case 7: {
        // Editing continues (7) or the server keeps the changes for the same key (3).
        db.update(wikiOfficeSessions).set({
          lastError: payload.status === 3 ? "saveError" : "forcesaveError", lastErrorAt: now, lastCallbackAt: now,
          ...(payload.status === 3 && live ? { state: "idle" as const, connectedUserIdsJson: "[]" } : {}),
        }).where(eq(wikiOfficeSessions.key, session.key)).run();
        if (payload.status === 7 && payload.userdata) {
          db.update(wikiOfficeOperations).set({ state: "failed", failureReason: "saveError" })
            .where(and(eq(wikiOfficeOperations.id, payload.userdata), eq(wikiOfficeOperations.pageId, pageId), inArray(wikiOfficeOperations.state, [...ACTIVE_OPERATION_STATES]))).run();
        }
        console.warn(JSON.stringify({ event: "office_save_error", pageId, key: session.key, status: payload.status }));
        return { ok: true };
      }
      case 4: {
        db.update(wikiOfficeSessions).set({ ...(live ? { state: "idle" as const } : {}), connectedUserIdsJson: "[]", lastCallbackAt: now }).where(eq(wikiOfficeSessions.key, session.key)).run();
        return { ok: true };
      }
      default:
        return { ok: true };
    }
  });
}
