import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { user, wikiOfficeDocuments, wikiOfficeSessions, wikiOfficeVersions, wikiPages } from "@/db/schema";
import { activeOperation } from "./sessions";

export function getOfficePage(pageId: string) {
  return db.select({ id: wikiPages.id, title: wikiPages.title, slug: wikiPages.slug, engine: wikiPages.documentEngine })
    .from(wikiPages).where(and(eq(wikiPages.id, pageId), isNull(wikiPages.deletedAt))).get() ?? null;
}

/** Stored state for the editor badge: what the app has durably saved. */
export function getOfficeStatus(pageId: string) {
  const office = db.select().from(wikiOfficeDocuments).where(eq(wikiOfficeDocuments.pageId, pageId)).get();
  if (!office?.headVersionId) return null;
  const head = db.select({ id: wikiOfficeVersions.id, version: wikiOfficeVersions.version, kind: wikiOfficeVersions.kind, createdAt: wikiOfficeVersions.createdAt })
    .from(wikiOfficeVersions).where(eq(wikiOfficeVersions.id, office.headVersionId)).get()!;
  const session = office.currentSessionKey
    ? db.select().from(wikiOfficeSessions).where(eq(wikiOfficeSessions.key, office.currentSessionKey)).get()
    : undefined;
  const recovered = db.select({ id: wikiOfficeVersions.id, createdAt: wikiOfficeVersions.createdAt }).from(wikiOfficeVersions)
    .where(and(eq(wikiOfficeVersions.pageId, pageId), eq(wikiOfficeVersions.kind, "branch"), gt(wikiOfficeVersions.createdAt, head.createdAt)))
    .orderBy(desc(wikiOfficeVersions.createdAt)).get();
  const operation = activeOperation(pageId);
  return {
    head: { id: head.id, version: head.version, kind: head.kind, storedAt: head.createdAt.getTime() },
    session: session ? {
      state: session.state,
      users: JSON.parse(session.connectedUserIdsJson) as string[],
      lastError: session.lastError && (session.lastErrorAt?.getTime() ?? 0) >= session.headLastsave ? session.lastError : null,
    } : null,
    recoveredVersionId: recovered?.id ?? null,
    operation: operation ? { kind: operation.kind, state: operation.state } : null,
  };
}

export type OfficeStatus = NonNullable<ReturnType<typeof getOfficeStatus>>;

export function listOfficeVersions(pageId: string) {
  return db.select({
    id: wikiOfficeVersions.id, version: wikiOfficeVersions.version, kind: wikiOfficeVersions.kind,
    createdAt: wikiOfficeVersions.createdAt, authorName: user.name,
  }).from(wikiOfficeVersions)
    .leftJoin(user, eq(user.id, wikiOfficeVersions.createdBy))
    .where(eq(wikiOfficeVersions.pageId, pageId))
    .orderBy(desc(wikiOfficeVersions.version))
    .limit(200)
    .all()
    .map((row) => ({ ...row, createdAt: row.createdAt.getTime() }));
}

export type OfficeVersionRow = ReturnType<typeof listOfficeVersions>[number];

export function getOfficeVersion(pageId: string, versionId: string) {
  return db.select().from(wikiOfficeVersions).where(and(eq(wikiOfficeVersions.id, versionId), eq(wikiOfficeVersions.pageId, pageId))).get() ?? null;
}
