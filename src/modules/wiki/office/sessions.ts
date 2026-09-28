import crypto from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { wikiOfficeDocuments, wikiOfficeOperations, wikiOfficeSessions } from "@/db/schema";
import { withPageOfficeLock } from "./page-lock";

export class OfficeConflictError extends Error {
  constructor(readonly code: "restoreInProgress" | "operationInProgress" | "notOffice") { super(code); }
}

export const ACTIVE_OPERATION_STATES = ["created", "sent"] as const;

export function activeOperation(pageId: string) {
  return db.select().from(wikiOfficeOperations)
    .where(and(eq(wikiOfficeOperations.pageId, pageId), inArray(wikiOfficeOperations.state, [...ACTIVE_OPERATION_STATES]))).get() ?? null;
}

/** Document keys: [0-9a-zA-Z.=_-], at most 128 characters. */
const newSessionKey = (pageId: string) => `${pageId.slice(0, 40)}-${crypto.randomBytes(12).toString("base64url").replace(/[^0-9a-zA-Z]/g, "x")}`;

/**
 * Returns the key editors must join. An `open` or `idle` session is reused
 * (the document server may still hold its unsaved changes); a new key is
 * minted from the head version only when no current session exists.
 */
export function getOrOpenSession(pageId: string) {
  return withPageOfficeLock(pageId, () => {
    const office = db.select().from(wikiOfficeDocuments).where(eq(wikiOfficeDocuments.pageId, pageId)).get();
    if (!office?.headVersionId) throw new OfficeConflictError("notOffice");
    const operation = activeOperation(pageId);
    if (operation?.kind === "restore") throw new OfficeConflictError("restoreInProgress");
    if (office.currentSessionKey) {
      const session = db.select().from(wikiOfficeSessions).where(eq(wikiOfficeSessions.key, office.currentSessionKey)).get();
      if (session && (session.state === "open" || session.state === "idle")) return session;
    }
    return db.transaction(() => {
      const key = newSessionKey(pageId);
      const session = db.insert(wikiOfficeSessions).values({ key, pageId, baseVersionId: office.headVersionId!, state: "idle" }).returning().get();
      db.update(wikiOfficeDocuments).set({ currentSessionKey: key }).where(eq(wikiOfficeDocuments.pageId, pageId)).run();
      return session;
    }, { behavior: "immediate" });
  });
}
