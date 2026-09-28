import { createHash } from "node:crypto";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db, sqlite } from "@/db";
import { wikiCommentThreads, wikiPageRevisions, wikiPages } from "@/db/schema";
import { rebuildPageDerivedData, schedulePageIndex } from "./page-derived-data";
import { isCommentAnchorOrphaned, type CommentAnchor } from "./lib/comment-anchors";
import { extractCitations, extractCommentAnchors, extractCommentNodeIds, extractEvidenceAnnotationIds, extractInternalSlugs, extractText } from "./lib/tiptap";
import { parseEditorDocument } from "./lib/editor-document";
import { withDocumentSectionIds } from "./lib/document-sections";
import { normalizeDocumentSettings, serializeDocumentSettings } from "./lib/document-settings";

function contentSnapshotHash(contentJson: string, documentMode: boolean, documentSettingsJson: string) {
  return createHash("sha256")
    .update(contentJson)
    .update("\0")
    .update(documentMode ? "1" : "0")
    .update("\0")
    .update(documentSettingsJson)
    .digest("hex");
}

export const saveSchema = z.object({
  id: z.string().min(1),
  contentJson: z.string().max(2_000_000),
  baseContentJson: z.string().max(2_000_000).optional(),
  documentMode: z.boolean().optional(),
  documentSettingsJson: z.string().max(200_000).optional(),
  baseDocumentMode: z.boolean().optional(),
  baseDocumentSettingsJson: z.string().max(200_000).optional(),
  expectedContentVersion: z.number().int().positive(),
  editorSessionId: z.string().min(8).max(200),
});

/** Stores a TipTap page snapshot. Only the live collaboration store calls this. */
export function savePageContentInternal(input: z.infer<typeof saveSchema>, user: { id: string }) {
  const data = saveSchema.parse(input);

  const page = db
    .select()
    .from(wikiPages)
    .where(and(eq(wikiPages.id, data.id), isNull(wikiPages.deletedAt)))
    .get();
  // Autosaves can arrive after another request deleted the page. Treat that
  // normal race as a no-op instead of surfacing a server error.
  if (!page) return { saved: false };
  // Office (DOCX) documents are stored by the office store only.
  if (page.documentEngine !== "tiptap") throw new Error("documentMovedToOffice");

  const parsedDoc = parseEditorDocument(data.contentJson);
  const doc = withDocumentSectionIds(parsedDoc);
  if (doc !== parsedDoc) data.contentJson = JSON.stringify(doc);

  const contentText = extractText(doc);
  const inferredTitle = /^(Unbenannte Notiz|Untitled note)$/.test(page.title)
    ? contentText.split("\n").map((line) => line.trim()).find(Boolean)?.slice(0, 200)
    : undefined;
  const effectiveTitle = inferredTitle || page.title;
  const slugs = extractInternalSlugs(doc);
  const citations = extractCitations(doc);
  const citationSourceIds = [...new Set(citations.map((item) => item.sourceId))];
  const commentAnchors = new Set(extractCommentAnchors(doc));
  const commentNodeIds = new Set(extractCommentNodeIds(doc));
  const evidenceAnnotationIds = extractEvidenceAnnotationIds(doc);
  const nextDocumentMode = data.documentMode ?? page.documentMode;
  let nextDocumentSettingsJson = page.documentSettingsJson;
  if (data.documentSettingsJson !== undefined) {
    try {
      nextDocumentSettingsJson = serializeDocumentSettings(normalizeDocumentSettings(JSON.parse(data.documentSettingsJson)));
    } catch {
      throw new Error("Invalid document settings");
    }
  }

  const incomingHash = contentSnapshotHash(data.contentJson, nextDocumentMode, nextDocumentSettingsJson);
  // A response can be lost after the transaction commits. Retrying that exact
  // snapshot acknowledges the existing save instead of creating a false conflict.
  if (incomingHash === contentSnapshotHash(page.contentJson, page.documentMode, page.documentSettingsJson)) {
    return { saved: true as const, conflict: false as const, contentVersion: page.contentVersion };
  }
  if (data.expectedContentVersion !== page.contentVersion) {
    const existingConflict = db.select({ id: wikiPageRevisions.id }).from(wikiPageRevisions)
      .where(and(
        eq(wikiPageRevisions.pageId, page.id),
        eq(wikiPageRevisions.kind, "conflict"),
        eq(wikiPageRevisions.contentHash, incomingHash),
      ))
      .get();
    const revision = existingConflict ?? db
      .insert(wikiPageRevisions)
      .values({
        pageId: page.id,
        version: page.version,
        contentVersion: data.expectedContentVersion,
        contentHash: incomingHash,
        title: page.title,
        contentJson: data.contentJson,
        status: page.status,
        citationLocale: page.citationLocale,
        citationStyle: page.citationStyle,
        documentMode: nextDocumentMode,
        documentSettingsJson: nextDocumentSettingsJson,
        documentTemplateId: page.documentTemplateId,
        kind: "conflict",
        createdBy: user.id,
      })
      .returning({ id: wikiPageRevisions.id })
      .get();
    return {
      saved: false as const,
      conflict: true as const,
      contentVersion: page.contentVersion,
      revisionId: revision.id,
      contentJson: page.contentJson,
      documentMode: page.documentMode,
      documentSettingsJson: page.documentSettingsJson,
    };
  }

  const nextVersion = page.version + 1;
  const nextContentVersion = page.contentVersion + 1;

  const applied = db.transaction(() => {
    const updated = db.update(wikiPages)
      .set({
        contentJson: data.contentJson,
        contentText,
        documentMode: nextDocumentMode,
        documentSettingsJson: nextDocumentSettingsJson,
        updatedBy: user.id,
        updatedAt: new Date(),
        version: nextVersion,
        contentVersion: nextContentVersion,
        ...(inferredTitle ? { title: inferredTitle } : {}),
      })
      .where(and(eq(wikiPages.id, data.id), eq(wikiPages.contentVersion, data.expectedContentVersion)))
      .returning({ contentVersion: wikiPages.contentVersion })
      .get();
    if (!updated) return false;

    rebuildPageDerivedData(data.id, effectiveTitle, { text: contentText, slugs, citationSourceIds, evidenceAnnotationIds }, user.id);

    const threads = db
      .select({
        id: wikiCommentThreads.id,
        anchorQuote: wikiCommentThreads.anchorQuote,
        anchorType: wikiCommentThreads.anchorType,
        anchorNodeId: wikiCommentThreads.anchorNodeId,
      })
      .from(wikiCommentThreads)
      .where(eq(wikiCommentThreads.pageId, data.id))
      .all();
    for (const thread of threads) {
      const anchor: CommentAnchor = thread.anchorType === "image"
        ? { type: "image", nodeId: thread.anchorNodeId ?? "", mode: "whole", label: thread.anchorQuote }
        : thread.anchorType === "text"
          ? { type: "text", quote: thread.anchorQuote }
          : { type: "page" };
      const orphaned = isCommentAnchorOrphaned(thread.id, anchor, { threadIds: commentAnchors, nodeIds: commentNodeIds, text: contentText });
      db.update(wikiCommentThreads)
        .set({ orphaned })
        .where(eq(wikiCommentThreads.id, thread.id))
        .run();
    }

    const recentRevision = sqlite
      .prepare("SELECT id FROM wiki_page_revisions WHERE page_id = ? AND created_by = ? AND kind = 'autosave' AND created_at > ? LIMIT 1")
      .get(data.id, user.id, Date.now() - 5 * 60_000);
    if (!recentRevision) {
      db.insert(wikiPageRevisions)
        .values({
          pageId: page.id,
          version: page.version,
          contentVersion: page.contentVersion,
          contentHash: contentSnapshotHash(page.contentJson, page.documentMode, page.documentSettingsJson),
          title: page.title,
          contentJson: page.contentJson,
          status: page.status,
          citationLocale: page.citationLocale,
          citationStyle: page.citationStyle,
          documentMode: page.documentMode,
          documentSettingsJson: page.documentSettingsJson,
          documentTemplateId: page.documentTemplateId,
          kind: "autosave",
          createdBy: user.id,
        })
        .run();
    }

    return true;
  });
  if (!applied) {
    return {
      saved: false as const,
      conflict: true as const,
      contentVersion: db.select({ contentVersion: wikiPages.contentVersion }).from(wikiPages).where(eq(wikiPages.id, data.id)).get()?.contentVersion ?? page.contentVersion,
      revisionId: "",
      contentJson: page.contentJson,
      documentMode: page.documentMode,
      documentSettingsJson: page.documentSettingsJson,
    };
  }
  schedulePageIndex(data.id, effectiveTitle, contentText);
  // No revalidatePath here: autosave must not re-render the open editor.
  return { saved: true as const, conflict: false as const, contentVersion: nextContentVersion };
}
