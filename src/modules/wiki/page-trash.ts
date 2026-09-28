import "server-only";
import fs from "node:fs";
import path from "node:path";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { db, sqlite } from "@/db";
import {
  contextLinks,
  evidenceLinks,
  wikiOfficeSessions,
  wikiPages,
  wikiPageSources,
  wikiPdfAnnotations,
  wikiPdfDocuments,
  wikiSources,
  wikiSourceContributors,
  wikiSourceTags,
  wikiTags,
} from "@/db/schema";
import { deleteAttachmentsFor, UPLOADS_PATH } from "@/lib/files";
import { descendantIds } from "./lib/page-tree";
import { pdfSourcePurgeBlocker } from "./lib/pdf-evidence";
import { removeFromIndex } from "./lib/vector-store.server";
import { withPageOfficeLocks } from "./office/page-lock";
import { activeOperation } from "./office/sessions";
import { cancelPageIndex, schedulePageIndex, syncPageFts } from "./page-derived-data";
import { syncSourceFts } from "./source-records";

/**
 * Trash, restore and purge for wiki pages and sources, shared by the single-item
 * and bulk actions. Callers check permissions and revalidate.
 */

function dropFromSearch(pageId: string) {
  sqlite.prepare("DELETE FROM wiki_pages_fts WHERE page_id = ?").run(pageId);
  removeFromIndex("page", pageId);
  cancelPageIndex(pageId);
}

/** Soft-deletes the given live pages and every live page below them, in one transaction. */
export function softDeletePageTrees(rootIds: readonly string[], userId: string): string[] {
  return db.transaction(() => {
    const live = db.select({ id: wikiPages.id, parentId: wikiPages.parentId }).from(wikiPages).where(isNull(wikiPages.deletedAt)).all();
    const liveIds = new Set(live.map((page) => page.id));
    const toDelete = [...descendantIds(live, rootIds.filter((id) => liveIds.has(id)))];
    if (toDelete.length === 0) return [];
    db.delete(contextLinks)
      .where(and(eq(contextLinks.targetType, "wikiPage"), inArray(contextLinks.targetId, toDelete)))
      .run();
    db.update(wikiPages)
      .set({ deletedAt: new Date(), updatedBy: userId })
      .where(inArray(wikiPages.id, toDelete))
      .run();
    for (const pageId of toDelete) dropFromSearch(pageId);
    return toDelete;
  });
}

export type RestoreResult = "ok" | "notFound" | "notTrashed";

/**
 * Restores a trashed page and its trashed subpages. When the original parent is
 * gone (still trashed or purged) the page comes back at the top level.
 */
export function restorePageTree(id: string, userId: string): { result: RestoreResult; restoredIds: string[] } {
  const restored = db.transaction(() => {
    const page = db.select().from(wikiPages).where(eq(wikiPages.id, id)).get();
    if (!page) return { result: "notFound" as const, pages: [] };
    if (!page.deletedAt) return { result: "notTrashed" as const, pages: [] };
    const all = db.select().from(wikiPages).all();
    const trashed = all.filter((candidate) => candidate.deletedAt);
    const restoreIds = descendantIds(trashed, [id]);
    const originalParentExists = page.parentId ? all.some((candidate) => candidate.id === page.parentId && !candidate.deletedAt) : true;
    const pages = all.filter((item) => restoreIds.has(item.id));
    for (const candidate of pages) {
      db.update(wikiPages).set({ deletedAt: null, ...(candidate.id === id && !originalParentExists ? { parentId: null } : {}), updatedBy: userId }).where(eq(wikiPages.id, candidate.id)).run();
      syncPageFts(candidate.id, candidate.title, candidate.contentText);
    }
    return { result: "ok" as const, pages };
  });
  for (const page of restored.pages) schedulePageIndex(page.id, page.title, page.contentText);
  return { result: restored.result, restoredIds: restored.pages.map((page) => page.id) };
}

export type PurgeResult = "ok" | "notFound" | "notTrashed" | "blocked" | "busy";

/** An editor still counts as connected only while the document server reported in recently. */
const OPEN_SESSION_STALE_MS = 24 * 60 * 60 * 1000;

function officeBusy(pageIds: string[]) {
  if (pageIds.some((pageId) => activeOperation(pageId))) return true;
  const since = new Date(Date.now() - OPEN_SESSION_STALE_MS);
  return Boolean(db.select({ key: wikiOfficeSessions.key }).from(wikiOfficeSessions)
    .where(and(inArray(wikiOfficeSessions.pageId, pageIds), eq(wikiOfficeSessions.state, "open"), gt(wikiOfficeSessions.lastCallbackAt, since)))
    .get());
}

function subtreeOf(id: string) {
  const all = db.select({ id: wikiPages.id, parentId: wikiPages.parentId, deletedAt: wikiPages.deletedAt }).from(wikiPages).all();
  return { all, ids: descendantIds(all, [id]) };
}

/**
 * Permanently deletes a trashed page and its subtree. Holds the office lock of
 * every page in the subtree so no save, restore or conversion runs meanwhile, then
 * re-checks the subtree under the locks. Idle office sessions do not block: they
 * cascade with the page, and edits the document server never saved are lost.
 */
export async function purgePageTree(id: string): Promise<{ result: PurgeResult; purgedIds: string[] }> {
  const planned = subtreeOf(id).ids;
  return withPageOfficeLocks(planned, () => {
    const fail = (result: Exclude<PurgeResult, "ok">) => ({ result, purgedIds: [] });
    const { all, ids } = subtreeOf(id);
    const root = all.find((item) => item.id === id);
    if (!root) return fail("notFound");
    if (!root.deletedAt) return fail("notTrashed");
    // A page created below it since planning is not locked: try again later.
    if ([...ids].some((pageId) => !planned.has(pageId))) return fail("busy");
    // A live page can sit below a trashed one (e.g. created from a stale tab); never destroy it.
    if (all.some((item) => ids.has(item.id) && !item.deletedAt)) return fail("blocked");
    if (officeBusy([...ids])) return fail("busy");
    const byId = new Map(all.map((item) => [item.id, item]));
    const depth = (item: { id: string; parentId: string | null }) => { let value = 0; let current = item; while (current.parentId && byId.has(current.parentId) && value < all.length) { value += 1; current = byId.get(current.parentId)!; } return value; };
    const ordered = all.filter((item) => ids.has(item.id)).sort((a, b) => depth(b) - depth(a));
    db.transaction(() => {
      for (const item of ordered) {
        deleteAttachmentsFor("wikiPage", item.id);
        db.delete(wikiPages).where(eq(wikiPages.id, item.id)).run();
        // Office versions cascade with the page; their DOCX files go after them.
        deleteAttachmentsFor("wikiOfficeDocument", item.id);
      }
    });
    for (const item of ordered) dropFromSearch(item.id);
    return { result: "ok" as const, purgedIds: ordered.map((item) => item.id) };
  });
}

/** Soft-deletes a source: removes its context links and full-text row. Call inside a transaction. */
export function softDeleteSource(id: string, userId: string): boolean {
  const source = db.select({ id: wikiSources.id }).from(wikiSources).where(and(eq(wikiSources.id, id), isNull(wikiSources.deletedAt))).get();
  if (!source) return false;
  const documentIds = db.select({ id: wikiPdfDocuments.id }).from(wikiPdfDocuments).where(eq(wikiPdfDocuments.sourceId, id)).all().map((document) => document.id);
  db.delete(contextLinks).where(and(eq(contextLinks.targetType, "wikiSource"), eq(contextLinks.targetId, id))).run();
  if (documentIds.length) db.delete(contextLinks).where(and(eq(contextLinks.targetType, "pdf"), inArray(contextLinks.targetId, documentIds))).run();
  db.update(wikiSources).set({ deletedAt: new Date(), updatedAt: new Date(), updatedBy: userId }).where(eq(wikiSources.id, id)).run();
  sqlite.prepare("DELETE FROM wiki_sources_fts WHERE source_id = ?").run(id);
  return true;
}

export function restoreSource(id: string, userId: string): RestoreResult {
  const source = db.select().from(wikiSources).where(eq(wikiSources.id, id)).get();
  if (!source) return "notFound";
  if (!source.deletedAt) return "notTrashed";
  db.update(wikiSources).set({ deletedAt: null, updatedBy: userId }).where(eq(wikiSources.id, id)).run();
  const contributors = db.select().from(wikiSourceContributors).where(eq(wikiSourceContributors.sourceId, id)).all();
  const tagNames = db.select({ name: wikiTags.name }).from(wikiSourceTags).innerJoin(wikiTags, eq(wikiSourceTags.tagId, wikiTags.id)).where(eq(wikiSourceTags.sourceId, id)).all().map((tag) => tag.name);
  syncSourceFts(id, { ...source, contributors, tagNames });
  return "ok";
}

/** Permanently deletes a trashed source unless live pages or PDF evidence still use it. */
export function purgeSource(id: string): PurgeResult {
  const source = db.select({ deletedAt: wikiSources.deletedAt }).from(wikiSources).where(eq(wikiSources.id, id)).get();
  if (!source) return "notFound";
  if (!source.deletedAt) return "notTrashed";
  const references = db.select({ pageId: wikiPageSources.pageId }).from(wikiPageSources).innerJoin(wikiPages, eq(wikiPageSources.pageId, wikiPages.id))
    .where(and(eq(wikiPageSources.sourceId, id), isNull(wikiPages.deletedAt))).all();
  const evidenceReferences = db.select({ id: evidenceLinks.id }).from(evidenceLinks)
    .innerJoin(wikiPdfAnnotations, eq(evidenceLinks.annotationId, wikiPdfAnnotations.id))
    .where(eq(wikiPdfAnnotations.sourceId, id)).all();
  if (pdfSourcePurgeBlocker({ activePageReferences: references.length, evidenceReferences: evidenceReferences.length })) return "blocked";
  const documents = db.select({ id: wikiPdfDocuments.id }).from(wikiPdfDocuments).where(eq(wikiPdfDocuments.sourceId, id)).all();
  for (const document of documents) {
    sqlite.prepare("DELETE FROM wiki_pdf_pages_fts WHERE document_id = ?").run(document.id);
    fs.rmSync(path.join(UPLOADS_PATH, "derived", document.id), { recursive: true, force: true });
  }
  deleteAttachmentsFor("wikiSource", id);
  db.delete(wikiSources).where(eq(wikiSources.id, id)).run();
  return "ok";
}
