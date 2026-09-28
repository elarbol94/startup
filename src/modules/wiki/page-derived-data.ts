import { and, eq, inArray } from "drizzle-orm";
import { db, sqlite } from "@/db";
import { evidenceLinks, wikiLinks, wikiPageSources, wikiPages, wikiPdfAnnotations, wikiSources } from "@/db/schema";
import { indexText } from "./lib/vector-store.server";

/**
 * Everything a page's body contributes to the rest of the workspace: backlinks,
 * cited sources, PDF evidence and full-text search. Shared by the TipTap save
 * path and the office (DOCX) store so both keep the same connections.
 * Callers run this inside their own transaction.
 */
export type PageDerivedData = {
  text: string;
  slugs: string[];
  citationSourceIds: string[];
  evidenceAnnotationIds: string[];
};

export function rebuildPageDerivedData(pageId: string, title: string, data: PageDerivedData, userId: string) {
  db.delete(wikiLinks).where(eq(wikiLinks.sourcePageId, pageId)).run();
  if (data.slugs.length > 0) {
    const targets = db.select({ id: wikiPages.id }).from(wikiPages).where(inArray(wikiPages.slug, data.slugs)).all()
      .filter((target) => target.id !== pageId);
    if (targets.length > 0) {
      db.insert(wikiLinks)
        .values(targets.map((target) => ({ sourcePageId: pageId, targetPageId: target.id })))
        .onConflictDoNothing()
        .run();
    }
  }

  db.delete(wikiPageSources)
    .where(and(eq(wikiPageSources.pageId, pageId), eq(wikiPageSources.relation, "citation")))
    .run();
  const sourceIds = [...new Set(data.citationSourceIds)];
  if (sourceIds.length > 0) {
    const existing = db.select({ id: wikiSources.id }).from(wikiSources).where(inArray(wikiSources.id, sourceIds)).all();
    if (existing.length) db.insert(wikiPageSources)
      .values(existing.map(({ id: sourceId }) => ({ pageId, sourceId, relation: "citation" as const })))
      .onConflictDoNothing()
      .run();
  }

  db.delete(evidenceLinks)
    .where(and(eq(evidenceLinks.targetType, "wikiPage"), eq(evidenceLinks.targetId, pageId)))
    .run();
  const annotationIds = [...new Set(data.evidenceAnnotationIds)];
  if (annotationIds.length > 0) {
    const annotations = db.select({ id: wikiPdfAnnotations.id }).from(wikiPdfAnnotations)
      .where(inArray(wikiPdfAnnotations.id, annotationIds)).all();
    if (annotations.length > 0) {
      db.insert(evidenceLinks).values(annotations.map((annotation) => ({
        annotationId: annotation.id, targetType: "wikiPage" as const, targetId: pageId, createdBy: userId,
      }))).onConflictDoNothing().run();
    }
  }

  syncPageFts(pageId, title, data.text);
}

export function syncPageFts(pageId: string, title: string, contentText: string) {
  sqlite.prepare("DELETE FROM wiki_pages_fts WHERE page_id = ?").run(pageId);
  sqlite.prepare("INSERT INTO wiki_pages_fts (page_id, title, content_text) VALUES (?, ?, ?)").run(pageId, title, contentText);
}

const indexing = new Map<string, ReturnType<typeof setTimeout>>();

/** Debounced embedding refresh; call after the saving transaction committed. */
export function schedulePageIndex(pageId: string, title: string, contentText: string) {
  clearTimeout(indexing.get(pageId));
  const timer = setTimeout(() => {
    indexing.delete(pageId);
    void indexText({ kind: "page", refId: pageId, text: `${title}\n\n${contentText}` })
      .catch((error: unknown) => console.warn(JSON.stringify({ event: "page_index_failed", pageId, reason: error instanceof Error ? error.message : "unknown" })));
  }, 1000);
  timer.unref?.();
  indexing.set(pageId, timer);
}
