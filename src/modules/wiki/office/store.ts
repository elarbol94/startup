import crypto from "node:crypto";
import fs from "node:fs";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { user, wikiOfficeDocuments, wikiOfficeSessions, wikiOfficeVersions, wikiPages } from "@/db/schema";
import { discardStagedAttachment, getAttachment, getAttachmentAbsolutePath, registerStagedAttachment, stageAttachmentBuffer, type StagedAttachment } from "@/lib/files";
import { rebuildPageDerivedData, schedulePageIndex } from "../page-derived-data";
import { extractDocx, type DocxExtract } from "./docx-extract";
import { unzipDocxBounded } from "./docx-safety";

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type VersionKind = (typeof wikiOfficeVersions.$inferInsert)["kind"];

export type PreparedDocx = { buffer: Buffer; extract: DocxExtract; sha256: string };

/** Validates and reads a DOCX before any database work (outside transactions). */
export function prepareDocx(buffer: Buffer): PreparedDocx {
  const extract = extractDocx(unzipDocxBounded(buffer));
  return { buffer, extract, sha256: crypto.createHash("sha256").update(buffer).digest("hex") };
}

const safeFileName = (title: string) => `${title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").trim().slice(0, 120) || "Dokument"}.docx`;

function existingUserId(id: string | null | undefined) {
  if (!id) return null;
  return db.select({ id: user.id }).from(user).where(eq(user.id, id)).get()?.id ?? null;
}

function nextVersionNumber(pageId: string) {
  const row = db.select({ max: sql<number>`coalesce(max(${wikiOfficeVersions.version}), 0)` }).from(wikiOfficeVersions).where(eq(wikiOfficeVersions.pageId, pageId)).get();
  return (row?.max ?? 0) + 1;
}

/** Makes `versionId` the page's head and refreshes everything derived from it. Call inside a transaction. */
function advanceHead(pageId: string, versionId: string, extract: DocxExtract, userId: string | null) {
  const page = db.select({ title: wikiPages.title, updatedBy: wikiPages.updatedBy }).from(wikiPages).where(eq(wikiPages.id, pageId)).get();
  if (!page) throw new Error("Page not found");
  const now = new Date();
  // Saves without a known author keep the previous editor.
  db.update(wikiOfficeDocuments).set({ headVersionId: versionId, updatedAt: now, ...(userId ? { updatedBy: userId } : {}) }).where(eq(wikiOfficeDocuments.pageId, pageId)).run();
  db.update(wikiPages).set({
    contentText: extract.text,
    updatedAt: now,
    updatedBy: userId ?? page.updatedBy,
    version: sql`${wikiPages.version} + 1`,
    contentVersion: sql`${wikiPages.contentVersion} + 1`,
  }).where(eq(wikiPages.id, pageId)).run();
  rebuildPageDerivedData(pageId, page.title, {
    text: extract.text,
    slugs: extract.slugs,
    citationSourceIds: extract.citationSourceIds,
    evidenceAnnotationIds: extract.evidenceAnnotationIds,
  }, userId ?? page.updatedBy);
  return page.title;
}

function stage(prepared: PreparedDocx, title: string) {
  return stageAttachmentBuffer({ buffer: prepared.buffer, fileName: safeFileName(title), mimeType: DOCX_MIME });
}

/**
 * Stores a version that becomes head immediately (create, import, copy,
 * restore, conversion). The caller holds the page lock.
 */
export function commitHeadVersion(pageId: string, prepared: PreparedDocx, kind: VersionKind, userId: string, options: { engine?: "office"; inTransaction?: (versionId: string) => void } = {}) {
  const page = db.select({ title: wikiPages.title }).from(wikiPages).where(eq(wikiPages.id, pageId)).get();
  if (!page) throw new Error("Page not found");
  const staged = stage(prepared, page.title);
  try {
    const versionId = db.transaction(() => {
      db.insert(wikiOfficeDocuments).values({ pageId, updatedBy: userId }).onConflictDoNothing().run();
      const head = db.select({ headVersionId: wikiOfficeDocuments.headVersionId }).from(wikiOfficeDocuments).where(eq(wikiOfficeDocuments.pageId, pageId)).get();
      const attachment = registerStagedAttachment(staged, { entityType: "wikiOfficeDocument", entityId: pageId, userId });
      const version = db.insert(wikiOfficeVersions).values({
        pageId, version: nextVersionNumber(pageId), kind, attachmentId: attachment.id,
        previousVersionId: head?.headVersionId ?? null, createdBy: userId,
      }).returning({ id: wikiOfficeVersions.id }).get();
      if (options.engine) db.update(wikiPages).set({ documentEngine: options.engine, documentMode: true }).where(eq(wikiPages.id, pageId)).run();
      advanceHead(pageId, version.id, prepared.extract, userId);
      options.inTransaction?.(version.id);
      return version.id;
    }, { behavior: "immediate" });
    schedulePageIndex(pageId, page.title, prepared.extract.text);
    return versionId;
  } catch (error) {
    discardStagedAttachment(staged);
    throw error;
  }
}

export type CallbackSave = {
  pageId: string;
  sessionKey: string;
  status: 2 | 6;
  lastsaveMs: number;
  prepared: PreparedDocx;
  changes: Buffer | null;
  historyJson: string | null;
  userId: string | null;
};

export type CallbackSaveResult = { versionId: string; advanced: boolean; duplicate: boolean };

export function callbackDigest(save: Pick<CallbackSave, "sessionKey" | "status" | "lastsaveMs"> & { sha256: string }) {
  return crypto.createHash("sha256").update(`${save.sessionKey}\0${save.status}\0${save.lastsaveMs}\0${save.sha256}`).digest("hex");
}

/**
 * Stores a document-server save. It becomes head only when it comes from the
 * page's current session and is not older than that session's watermark
 * (`lastsave` has one-second resolution; arrival order under the page lock
 * breaks ties). Anything else is kept as a recoverable `branch`.
 * The caller holds the page lock.
 */
export function commitCallbackSave(save: CallbackSave): CallbackSaveResult {
  const digest = callbackDigest({ ...save, sha256: save.prepared.sha256 });
  const existing = db.select({ id: wikiOfficeVersions.id }).from(wikiOfficeVersions).where(eq(wikiOfficeVersions.callbackDigest, digest)).get();
  if (existing) return { versionId: existing.id, advanced: false, duplicate: true };

  const page = db.select({ title: wikiPages.title }).from(wikiPages).where(eq(wikiPages.id, save.pageId)).get();
  if (!page) throw new Error("Page not found");
  const userId = existingUserId(save.userId);
  const staged: StagedAttachment[] = [stage(save.prepared, page.title)];
  try {
    if (save.changes) staged.push(stageAttachmentBuffer({ buffer: save.changes, fileName: "changes.zip", mimeType: "application/zip", internal: true }));
    const result = db.transaction(() => {
      const owner = { entityType: "wikiOfficeDocument" as const, entityId: save.pageId, userId: userId ?? "" };
      const office = db.select().from(wikiOfficeDocuments).where(eq(wikiOfficeDocuments.pageId, save.pageId)).get();
      const session = db.select().from(wikiOfficeSessions).where(and(eq(wikiOfficeSessions.key, save.sessionKey), eq(wikiOfficeSessions.pageId, save.pageId))).get();
      if (!office || !session) throw new Error("Unknown office session");
      const current = office.currentSessionKey === session.key && (session.state === "open" || session.state === "idle");
      const advance = current && save.lastsaveMs >= session.headLastsave;
      const attachment = registerStagedAttachment(staged[0], withUploader(owner));
      const changes = staged[1] ? registerStagedAttachment(staged[1], withUploader(owner)) : null;
      const kind: VersionKind = !advance ? "branch" : save.status === 2 ? "final" : "forcesave";
      const version = db.insert(wikiOfficeVersions).values({
        pageId: save.pageId, version: nextVersionNumber(save.pageId), sessionKey: save.sessionKey, kind,
        lastsave: save.lastsaveMs, attachmentId: attachment.id, changesAttachmentId: changes?.id ?? null,
        historyJson: save.historyJson, previousVersionId: office.headVersionId, callbackDigest: digest, createdBy: userId,
      }).returning({ id: wikiOfficeVersions.id }).get();
      if (advance) {
        advanceHead(save.pageId, version.id, save.prepared.extract, userId);
        db.update(wikiOfficeSessions).set({ headLastsave: save.lastsaveMs, lastCallbackAt: new Date() }).where(eq(wikiOfficeSessions.key, session.key)).run();
      }
      return { versionId: version.id, advanced: advance };
    }, { behavior: "immediate" });
    if (result.advanced) schedulePageIndex(save.pageId, page.title, save.prepared.extract.text);
    return { ...result, duplicate: false };
  } catch (error) {
    for (const file of staged) discardStagedAttachment(file);
    throw error;
  }
}

/** Document-server saves have no app user when the author is unknown; attribute them to the page's last editor. */
function withUploader(owner: { entityType: "wikiOfficeDocument"; entityId: string; userId: string }) {
  if (owner.userId) return owner;
  const page = db.select({ updatedBy: wikiPages.updatedBy }).from(wikiPages).where(eq(wikiPages.id, owner.entityId)).get();
  return { ...owner, userId: page?.updatedBy ?? "" };
}

/** Reads a stored version's DOCX bytes. */
export function readVersionFile(attachmentId: string) {
  const attachment = getAttachment(attachmentId);
  if (!attachment) throw new Error("Version file missing");
  return fs.readFileSync(getAttachmentAbsolutePath(attachment.storedName));
}

export function headVersion(pageId: string) {
  return db.select({ version: wikiOfficeVersions }).from(wikiOfficeDocuments)
    .innerJoin(wikiOfficeVersions, eq(wikiOfficeVersions.id, wikiOfficeDocuments.headVersionId))
    .where(eq(wikiOfficeDocuments.pageId, pageId)).get()?.version ?? null;
}

export function listVersions(pageId: string) {
  return db.select().from(wikiOfficeVersions).where(eq(wikiOfficeVersions.pageId, pageId)).orderBy(desc(wikiOfficeVersions.version)).all();
}
