"use server";
import fs from "node:fs";
import path from "node:path";

import { z } from "zod";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, sqlite } from "@/db";
import {
  contextLinks,
  evidenceLinks,
  wikiFavorites,
  wikiNotifications,
  wikiPages,
  wikiCitationStyles,
  wikiPdfAnnotations,
  wikiPdfDocuments,
  wikiPageSources,
  wikiPageTags,
  wikiSourceContributors,
  wikiSourceRevisions,
  wikiSources,
  wikiSourceTags,
  wikiTags,
} from "@/db/schema";
import { requireAdmin, requireUserOrThrow } from "@/lib/auth";
import { deleteAttachmentsFor, UPLOADS_PATH } from "@/lib/files";
import { pdfSourcePurgeBlocker } from "./lib/pdf-evidence";
import { sourceInputSchema } from "./lib/source-input";
import { ensureTags, syncSourceFts, saveSourceRecord } from "./source-records";
import { buildFtsQuery } from "./lib/tiptap";
import { fuseRankings } from "./lib/search-ranking";
import { searchSimilar } from "./lib/vector-store.server";
import { searchPdfPageText } from "./pdf-queries";

function revalidateWiki() {
  revalidatePath("/wiki", "layout");
}

const pageMetaSchema = z.object({
  pageId: z.string().min(1),
  status: z.enum(["inbox", "working", "evergreen"]),
  citationLocale: z.enum(["de-DE", "en-US"]),
  citationStyle: z.enum(wikiCitationStyles).optional(),
  tagNames: z.array(z.string().trim().min(1).max(40)).max(20),
});

export async function updatePageResearchMeta(input: z.input<typeof pageMetaSchema>) {
  const currentUser = await requireUserOrThrow();
  const data = pageMetaSchema.parse(input);
  const page = db.select().from(wikiPages).where(and(eq(wikiPages.id, data.pageId), isNull(wikiPages.deletedAt))).get();
  if (!page) throw new Error("Page not found");
  const tags = ensureTags(data.tagNames, currentUser.id);
  db.transaction(() => {
    db.update(wikiPages).set({ status: data.status, citationLocale: data.citationLocale, ...(data.citationStyle ? { citationStyle: data.citationStyle } : {}), updatedBy: currentUser.id, updatedAt: new Date(), version: page.version + 1 }).where(eq(wikiPages.id, page.id)).run();
    db.delete(wikiPageTags).where(eq(wikiPageTags.pageId, page.id)).run();
    if (tags.length) db.insert(wikiPageTags).values(tags.map((tag) => ({ pageId: page.id, tagId: tag.id }))).run();
  });
  revalidateWiki();
}

export async function toggleFavorite(entityType: "page" | "source", entityId: string) {
  const currentUser = await requireUserOrThrow();
  const where = and(eq(wikiFavorites.userId, currentUser.id), eq(wikiFavorites.entityType, entityType), eq(wikiFavorites.entityId, entityId));
  const existing = db.select().from(wikiFavorites).where(where).get();
  if (existing) db.delete(wikiFavorites).where(where).run();
  else db.insert(wikiFavorites).values({ userId: currentUser.id, entityType, entityId }).run();
  revalidateWiki();
  return { favorite: !existing };
}

export async function saveSource(input: z.infer<typeof sourceInputSchema>) {
  const currentUser = await requireUserOrThrow();
  const result = saveSourceRecord(input, currentUser.id);
  if (result.ok) revalidateWiki();
  return result;
}

export async function linkSupportingSource(pageId: string, sourceId: string) {
  await requireUserOrThrow();
  db.insert(wikiPageSources).values({ pageId, sourceId, relation: "supporting" }).onConflictDoNothing().run();
  revalidateWiki();
}

export async function deleteSource(id: string) {
  const currentUser = await requireUserOrThrow();
  const documentIds = db
    .select({ id: wikiPdfDocuments.id })
    .from(wikiPdfDocuments)
    .where(eq(wikiPdfDocuments.sourceId, id))
    .all()
    .map((document) => document.id);
  db.transaction((tx) => {
    tx.delete(contextLinks)
      .where(
        and(
          eq(contextLinks.targetType, "wikiSource"),
          eq(contextLinks.targetId, id),
        ),
      )
      .run();
    if (documentIds.length) {
      tx.delete(contextLinks)
        .where(
          and(
            eq(contextLinks.targetType, "pdf"),
            inArray(contextLinks.targetId, documentIds),
          ),
        )
        .run();
    }
    tx.update(wikiSources).set({ deletedAt: new Date(), updatedAt: new Date(), updatedBy: currentUser.id }).where(eq(wikiSources.id, id)).run();
  });
  sqlite.prepare("DELETE FROM wiki_sources_fts WHERE source_id = ?").run(id);
  revalidateWiki();
}

export async function restoreFromTrash(entityType: "page" | "source", id: string) {
  const currentUser = await requireUserOrThrow();
  if (entityType === "page") {
    const page = db.select().from(wikiPages).where(eq(wikiPages.id, id)).get();
    if (!page) throw new Error("Page not found");
    const all = db.select().from(wikiPages).all();
    const restoreIds = new Set<string>([id]);
    let changed = true;
    while (changed) { changed = false; for (const candidate of all) if (candidate.parentId && restoreIds.has(candidate.parentId) && !restoreIds.has(candidate.id)) { restoreIds.add(candidate.id); changed = true; } }
    const originalParentExists = page.parentId ? all.some((candidate) => candidate.id === page.parentId && !candidate.deletedAt) : true;
    db.transaction(() => {
      for (const candidate of all.filter((item) => restoreIds.has(item.id))) {
        db.update(wikiPages).set({ deletedAt: null, ...(candidate.id === id && !originalParentExists ? { parentId: null } : {}), updatedBy: currentUser.id }).where(eq(wikiPages.id, candidate.id)).run();
        sqlite.prepare("DELETE FROM wiki_pages_fts WHERE page_id = ?").run(candidate.id);
        sqlite.prepare("INSERT INTO wiki_pages_fts (page_id, title, content_text) VALUES (?, ?, ?)").run(candidate.id, candidate.title, candidate.contentText);
      }
    });
  } else {
    const source = db.select().from(wikiSources).where(eq(wikiSources.id, id)).get();
    if (!source) throw new Error("Source not found");
    db.update(wikiSources).set({ deletedAt: null, updatedBy: currentUser.id }).where(eq(wikiSources.id, id)).run();
    const contributors = db.select().from(wikiSourceContributors).where(eq(wikiSourceContributors.sourceId, id)).all();
    const tagNames = db.select({ name: wikiTags.name }).from(wikiSourceTags).innerJoin(wikiTags, eq(wikiSourceTags.tagId, wikiTags.id)).where(eq(wikiSourceTags.sourceId, id)).all().map((tag) => tag.name);
    syncSourceFts(id, { ...source, contributors, tagNames });
  }
  revalidateWiki();
}

export async function purgeFromTrash(entityType: "page" | "source", id: string) {
  await requireAdmin();
  if (entityType === "source") {
    const references = db.select({ pageId: wikiPageSources.pageId }).from(wikiPageSources).innerJoin(wikiPages, eq(wikiPageSources.pageId, wikiPages.id))
      .where(and(eq(wikiPageSources.sourceId, id), isNull(wikiPages.deletedAt))).all();
    const evidenceReferences = db.select({ id: evidenceLinks.id }).from(evidenceLinks)
      .innerJoin(wikiPdfAnnotations, eq(evidenceLinks.annotationId, wikiPdfAnnotations.id))
      .where(eq(wikiPdfAnnotations.sourceId, id)).all();
    const purgeBlocker = pdfSourcePurgeBlocker({ activePageReferences: references.length, evidenceReferences: evidenceReferences.length });
    if (purgeBlocker === "active-pages") throw new Error("Source is still referenced by active pages");
    if (purgeBlocker === "evidence") throw new Error("Source PDF evidence is still referenced");
    const documents = db.select({ id: wikiPdfDocuments.id }).from(wikiPdfDocuments)
      .where(eq(wikiPdfDocuments.sourceId, id)).all();
    for (const document of documents) {
      sqlite.prepare("DELETE FROM wiki_pdf_pages_fts WHERE document_id = ?").run(document.id);
      fs.rmSync(path.join(UPLOADS_PATH, "derived", document.id), { recursive: true, force: true });
    }
    deleteAttachmentsFor("wikiSource", id);
    db.delete(wikiSources).where(eq(wikiSources.id, id)).run();
  } else {
    const all = db.select({ id: wikiPages.id, parentId: wikiPages.parentId, deletedAt: wikiPages.deletedAt }).from(wikiPages).all();
    if (!all.find((item) => item.id === id)?.deletedAt) throw new Error("Only trashed pages can be purged");
    const purgeIds = new Set<string>([id]);
    let changed = true;
    while (changed) { changed = false; for (const candidate of all) if (candidate.parentId && purgeIds.has(candidate.parentId) && !purgeIds.has(candidate.id)) { purgeIds.add(candidate.id); changed = true; } }
    // A live page can sit below a trashed one (e.g. created from a stale tab); never destroy it.
    if (all.some((item) => purgeIds.has(item.id) && !item.deletedAt)) throw new Error("Page still has active subpages");
    const byId = new Map(all.map((item) => [item.id, item]));
    const depth = (item: { id: string; parentId: string | null }) => { let value = 0; let current = item; while (current.parentId && byId.has(current.parentId)) { value += 1; current = byId.get(current.parentId)!; } return value; };
    const ordered = all.filter((item) => purgeIds.has(item.id)).sort((a, b) => depth(b) - depth(a));
    db.transaction(() => { for (const item of ordered) {
      deleteAttachmentsFor("wikiPage", item.id);
      db.delete(wikiPages).where(eq(wikiPages.id, item.id)).run();
      // Office versions cascade with the page; their DOCX files go after them.
      deleteAttachmentsFor("wikiOfficeDocument", item.id);
    } });
  }
  revalidateWiki();
}

export async function restoreSourceRevision(revisionId: string) {
  const currentUser = await requireUserOrThrow();
  const revision = db.select().from(wikiSourceRevisions).where(eq(wikiSourceRevisions.id, revisionId)).get();
  if (!revision) throw new Error("Revision not found");
  const current = db.select().from(wikiSources).where(eq(wikiSources.id, revision.sourceId)).get();
  if (!current) throw new Error("Source not found");
  const snapshot = JSON.parse(revision.snapshotJson) as typeof current & { contributors?: Array<{ role: "author" | "editor"; given: string; family: string; literal: string }> };
  const values = { type: snapshot.type, title: snapshot.title, subtitle: snapshot.subtitle, issuedDate: snapshot.issuedDate, containerTitle: snapshot.containerTitle, publisher: snapshot.publisher, institution: snapshot.institution, edition: snapshot.edition, volume: snapshot.volume, issue: snapshot.issue, pages: snapshot.pages, doi: snapshot.doi, isbn: snapshot.isbn, url: snapshot.url, accessedAt: snapshot.accessedAt, language: snapshot.language, abstract: snapshot.abstract, notes: snapshot.notes, readingStatus: snapshot.readingStatus };
  db.transaction(() => {
    const contributors = db.select().from(wikiSourceContributors).where(eq(wikiSourceContributors.sourceId, current.id)).all();
    db.insert(wikiSourceRevisions).values({ sourceId: current.id, version: current.version, snapshotJson: JSON.stringify({ ...current, contributors }), createdBy: currentUser.id }).run();
    db.update(wikiSources).set({ ...values, version: current.version + 1, updatedBy: currentUser.id, updatedAt: new Date() }).where(eq(wikiSources.id, current.id)).run();
    db.delete(wikiSourceContributors).where(eq(wikiSourceContributors.sourceId, current.id)).run();
    if (snapshot.contributors?.length) db.insert(wikiSourceContributors).values(snapshot.contributors.map((person, index) => ({ ...person, sourceId: current.id, sortOrder: index }))).run();
  });
  const tagNames = db.select({ name: wikiTags.name }).from(wikiSourceTags).innerJoin(wikiTags, eq(wikiSourceTags.tagId, wikiTags.id)).where(eq(wikiSourceTags.sourceId, current.id)).all().map((tag) => tag.name);
  syncSourceFts(current.id, { ...snapshot, ...values, contributors: snapshot.contributors ?? [], tagNames });
  revalidateWiki();
}

export type SearchHit =
  | { kind: "page"; key: string; title: string; snippet: string; href: string; status: string }
  | { kind: "source"; key: string; title: string; snippet: string; href: string; sourceType: string; issuedDate: string }
  | { kind: "pdfPage"; key: string; title: string; snippet: string; href: string; pageNumber: number }
  | { kind: "annotation"; key: string; title: string; snippet: string; href: string; pageNumber: number };

export async function searchResearch(query: string, options: { limit?: number; tagId?: string } = {}) {
  await requireUserOrThrow();
  const clean = z.string().max(200).parse(query);
  const { limit = 40, tagId } = z.object({
    limit: z.number().int().min(1).max(500).optional(),
    tagId: z.string().min(1).optional(),
  }).parse(options);
  const fts = buildFtsQuery(clean);
  if (!fts) return { results: [] as SearchHit[] };

  // A tag narrows pages and sources directly, and PDF pages and annotations through
  // the source they belong to, so one chip filters every kind consistently.
  const pageTagClause = tagId ? "AND EXISTS (SELECT 1 FROM wiki_page_tags pt WHERE pt.page_id = p.id AND pt.tag_id = ?)" : "";
  const sourceTagClause = tagId ? "AND EXISTS (SELECT 1 FROM wiki_source_tags st WHERE st.source_id = s.id AND st.tag_id = ?)" : "";
  const tagParams = tagId ? [tagId] : [];

  const pages = sqlite.prepare(`SELECT p.id, p.title, p.slug, p.status,
    snippet(wiki_pages_fts, 2, '<mark>', '</mark>', '…', 12) AS snippet
    FROM wiki_pages_fts f JOIN wiki_pages p ON p.id = f.page_id
    WHERE wiki_pages_fts MATCH ? AND p.deleted_at IS NULL ${pageTagClause} ORDER BY rank LIMIT 20`).all(fts, ...tagParams) as Array<{ id: string; title: string; slug: string; status: string; snippet: string }>;

  const sources = sqlite.prepare(`SELECT s.id, s.title, s.type, s.issued_date AS issuedDate,
    snippet(wiki_sources_fts, 4, '<mark>', '</mark>', '…', 12) AS snippet,
    (SELECT d.id FROM wiki_pdf_documents d
     WHERE d.source_id = s.id AND d.status = 'ready'
     ORDER BY CASE WHEN d.role = 'primary' THEN 0 ELSE 1 END, d.created_at ASC
     LIMIT 1) AS documentId
    FROM wiki_sources_fts f JOIN wiki_sources s ON s.id = f.source_id
    WHERE wiki_sources_fts MATCH ? AND s.deleted_at IS NULL ${sourceTagClause} ORDER BY rank LIMIT 20`).all(fts, ...tagParams) as Array<{ id: string; title: string; type: string; issuedDate: string; snippet: string; documentId: string | null }>;

  const pdfPages = searchPdfPageText(clean, 20, tagId);

  // Annotations were only reachable from inside the evidence picker, so your own
  // highlights could not be found from the search bar at all. No FTS index covers
  // them yet, so this stays a LIKE scan, bounded and ranked by recency.
  const like = `%${clean.trim()}%`;
  const annotations = sqlite.prepare(`SELECT a.id, a.source_id AS sourceId, a.document_id AS documentId,
    a.page_number AS pageNumber, a.selected_text AS selectedText, a.note, a.label, s.title AS sourceTitle
    FROM wiki_pdf_annotations a JOIN wiki_sources s ON s.id = a.source_id
    WHERE a.deleted_at IS NULL AND s.deleted_at IS NULL
      AND (a.selected_text LIKE ? OR a.note LIKE ? OR a.label LIKE ?) ${sourceTagClause}
    ORDER BY a.updated_at DESC LIMIT 20`).all(like, like, like, ...tagParams) as Array<{ id: string; sourceId: string; documentId: string; pageNumber: number; selectedText: string; note: string; label: string; sourceTitle: string }>;

  const pageHits: SearchHit[] = pages.map((row) => ({
    kind: "page", key: `page:${row.id}`, title: row.title, snippet: row.snippet,
    href: `/wiki/pages/${row.slug}`, status: row.status,
  }));
  const sourceHits: SearchHit[] = sources.map((row) => ({
    kind: "source", key: `source:${row.id}`, title: row.title, snippet: row.snippet,
    href: `/wiki/sources/${row.id}`, sourceType: row.type, issuedDate: row.issuedDate,
  }));
  const pdfHits: SearchHit[] = pdfPages.map((row) => ({
    kind: "pdfPage", key: `pdf:${row.documentId}:${row.pageNumber}`, title: row.sourceTitle, snippet: row.snippet,
    href: `/wiki/sources/${row.sourceId}/read/${row.documentId}?page=${row.pageNumber}`, pageNumber: row.pageNumber,
  }));
  const annotationHits: SearchHit[] = annotations.map((row) => ({
    kind: "annotation", key: `annotation:${row.id}`, title: row.label || row.sourceTitle,
    snippet: row.selectedText || row.note,
    href: `/wiki/sources/${row.sourceId}/read/${row.documentId}?page=${row.pageNumber}&annotation=${row.id}`,
    pageNumber: row.pageNumber,
  }));

  // Semantic hits, when the model and vector extension are both available. They are
  // fused with the keyword lists rather than replacing them: embedding distances on this
  // model sit in a narrow band, so a correct match can beat a wrong one by a few
  // thousandths. Agreement between the two retrievers is what makes a result trustworthy.
  const semanticHits: SearchHit[] = [];
  const semantic = await searchSimilar(clean, 20).catch(() => null);
  if (semantic?.length) {
    const pageIds = semantic.filter((hit) => hit.kind === "page").map((hit) => hit.refId);
    const documentIds = semantic.filter((hit) => hit.kind === "pdfPage").map((hit) => hit.refId);
    const pageRows = pageIds.length ? sqlite.prepare(
      `SELECT id, title, slug, status FROM wiki_pages WHERE deleted_at IS NULL AND id IN (${pageIds.map(() => "?").join(",")})`,
    ).all(...pageIds) as Array<{ id: string; title: string; slug: string; status: string }> : [];
    const documentRows = documentIds.length ? sqlite.prepare(
      `SELECT d.id, d.source_id AS sourceId, s.title AS sourceTitle FROM wiki_pdf_documents d
       JOIN wiki_sources s ON s.id = d.source_id
       WHERE s.deleted_at IS NULL AND d.id IN (${documentIds.map(() => "?").join(",")})`,
    ).all(...documentIds) as Array<{ id: string; sourceId: string; sourceTitle: string }> : [];
    const pageById = new Map(pageRows.map((row) => [row.id, row]));
    const documentById = new Map(documentRows.map((row) => [row.id, row]));

    for (const hit of semantic) {
      const snippet = hit.text.slice(0, 240);
      if (hit.kind === "page") {
        const page = pageById.get(hit.refId);
        if (!page) continue;
        semanticHits.push({ kind: "page", key: `page:${page.id}`, title: page.title, snippet, href: `/wiki/pages/${page.slug}`, status: page.status });
      } else {
        const document = documentById.get(hit.refId);
        if (!document) continue;
        semanticHits.push({
          kind: "pdfPage", key: `pdf:${document.id}:${hit.pageNumber}`, title: document.sourceTitle, snippet,
          href: `/wiki/sources/${document.sourceId}/read/${document.id}?page=${hit.pageNumber}`, pageNumber: hit.pageNumber,
        });
      }
    }
  }

  // One ranked list rather than four capped sections: a page hit ranked eleventh used
  // to be invisible even when it beat every PDF hit.
  const results = fuseRankings<SearchHit>(
    [pageHits, sourceHits, pdfHits, annotationHits, semanticHits],
    (hit) => hit.key,
  ).slice(0, limit);
  return { results };
}

export async function importSourceRecords(records: unknown[]) {
  await requireUserOrThrow();
  const parsed = z.array(sourceInputSchema).max(1000).parse(records);
  const results = [];
  for (const record of parsed) results.push(await saveSource(record));
  return { imported: results.filter((result) => result.ok).length, duplicates: results.filter((result) => !result.ok).length };
}

export async function renameTag(tagId: string, name: string) {
  await requireAdmin();
  const clean = z.string().trim().min(1).max(40).parse(name);
  const normalizedName = clean.toLocaleLowerCase();
  const duplicate = db.select().from(wikiTags).where(eq(wikiTags.normalizedName, normalizedName)).get();
  if (duplicate && duplicate.id !== tagId) throw new Error("A tag with this name already exists");
  db.update(wikiTags).set({ name: clean, normalizedName }).where(eq(wikiTags.id, tagId)).run();
  revalidateWiki();
}

export async function mergeTags(sourceTagId: string, targetTagId: string) {
  await requireAdmin();
  if (sourceTagId === targetTagId) return;
  const pageLinks = db.select().from(wikiPageTags).where(eq(wikiPageTags.tagId, sourceTagId)).all();
  const sourceLinks = db.select().from(wikiSourceTags).where(eq(wikiSourceTags.tagId, sourceTagId)).all();
  db.transaction(() => {
    if (pageLinks.length) db.insert(wikiPageTags).values(pageLinks.map((link) => ({ pageId: link.pageId, tagId: targetTagId }))).onConflictDoNothing().run();
    if (sourceLinks.length) db.insert(wikiSourceTags).values(sourceLinks.map((link) => ({ sourceId: link.sourceId, tagId: targetTagId }))).onConflictDoNothing().run();
    db.delete(wikiTags).where(eq(wikiTags.id, sourceTagId)).run();
  });
  revalidateWiki();
}

export async function markNotificationsRead(ids?: string[]) {
  const currentUser = await requireUserOrThrow();
  const where = ids?.length ? and(eq(wikiNotifications.userId, currentUser.id), inArray(wikiNotifications.id, ids)) : eq(wikiNotifications.userId, currentUser.id);
  db.update(wikiNotifications).set({ readAt: new Date() }).where(where).run();
  revalidateWiki();
}
