import * as Y from "yjs";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db, sqlite } from "@/db";
import { user, wikiCommentThreads, wikiComments, wikiPages } from "@/db/schema";
import { documentJSON } from "../collaboration/codec";
import { generateDocumentDocx } from "../lib/document-docx";
import { snapshotDocumentImages } from "../lib/document-pdf";
import { parseDocumentSettings } from "../lib/document-settings";
import { isFigure } from "../lib/figure";
import { SUGGESTION_DELETE, SUGGESTION_INSERT } from "../lib/suggestions";
import { extractCitations, extractEvidenceAnnotationIds, extractInternalSlugs, parseStoredDocument, type TiptapNode } from "../lib/tiptap";
import { getWikiTypographyForUser } from "../lib/wiki-typography.server";
import { prepareDocx, type PreparedDocx } from "./store";
import { missingWords } from "./text-compare";

/**
 * Converts a TipTap document page into a DOCX and proves the result keeps
 * every connection. Used read-only by the dry run and, later, by the real
 * conversion. Nothing here writes to the database.
 */

/** Node types the DOCX exporter reproduces (see lib/document-docx.ts). */
const SUPPORTED_NODES = new Set([
  "doc", "paragraph", "text", "heading", "hardBreak", "blockquote", "bulletList", "orderedList", "listItem",
  "taskList", "taskItem", "commentableImage", "mermaidDiagram", "markdownTable", "markdownTableRow",
  "markdownTableHeader", "markdownTableCell", "pageBreak", "signatureBlock", "taskReference", "deadlineReference",
  "pdfEvidence", "citation", "figureList", "crossReference", "documentVariable", "annexMarker",
]);
/** Marks the exporter keeps; others are formatting that is lost (a warning, not a blocker). */
const SUPPORTED_MARKS = new Set(["bold", "italic", "strike", "subscript", "superscript", "link", "comment"]);

export type ConversionIssue = {
  severity: "blocking" | "warning";
  code: "unsupportedNode" | "formattingLost" | "unresolvedSuggestion" | "imageMissing" | "relationMismatch" | "textMismatch" | "emptyCommentThreads";
  detail: string;
};

type Relations = { citations: string[]; evidence: string[]; slugs: string[]; tasks: string[]; deadlines: string[] };

export type ConversionPlan = {
  page: { id: string; title: string; slug: string };
  source: "room" | "json";
  nodes: Record<string, number>;
  expected: Relations;
  actual: Relations;
  comments: { exported: number; emptyThreads: number; resolvedThreads: number };
  images: { total: number; resolved: number };
  issues: ConversionIssue[];
  ok: boolean;
  prepared: PreparedDocx;
};

/** Reads the page body: the live collaboration room is authoritative when it exists. */
export function currentPageDocument(pageId: string, contentJson: string, documentSettingsJson: string) {
  const room = sqlite.prepare("SELECT state FROM wiki_collaboration_rooms WHERE key = ?").get(`page:${pageId}`) as { state: Buffer } | undefined;
  if (!room) return { source: "json" as const, doc: parseStoredDocument(contentJson), settings: parseDocumentSettings(documentSettingsJson) };
  const ydoc = new Y.Doc();
  try {
    Y.applyUpdate(ydoc, room.state);
    const layout = ydoc.getMap("layout").toJSON() as { settings?: unknown };
    const settings = layout.settings ? parseDocumentSettings(JSON.stringify(layout.settings)) : parseDocumentSettings(documentSettingsJson);
    return { source: "room" as const, doc: documentJSON(ydoc), settings };
  } finally {
    ydoc.destroy();
  }
}

function walk(doc: TiptapNode, visit: (node: TiptapNode) => void) {
  visit(doc);
  for (const child of doc.content ?? []) walk(child, visit);
}

function expectedRelations(doc: TiptapNode): Relations {
  const tasks = new Set<string>(), deadlines = new Set<string>();
  walk(doc, (node) => {
    if (node.type === "taskReference" && node.attrs?.taskId) tasks.add(String(node.attrs.taskId));
    if (node.type === "deadlineReference" && node.attrs?.deadlineId) deadlines.add(String(node.attrs.deadlineId));
  });
  return {
    citations: [...new Set(extractCitations(doc).map((item) => item.sourceId))],
    evidence: extractEvidenceAnnotationIds(doc),
    slugs: extractInternalSlugs(doc),
    tasks: [...tasks],
    deadlines: [...deadlines],
  };
}

/** Visible text for the comparison: line breaks separate words, blocks separate lines. */
function comparableText(doc: TiptapNode) {
  const parts: string[] = [];
  walk(doc, (node) => {
    if (node.text !== undefined) parts.push(node.text);
    else if (node.type === "hardBreak") parts.push(" ");
    else if (node.type !== "doc") parts.push("\n");
    if (node.type === "citation" || node.type === "taskReference" || node.type === "deadlineReference") parts.push(String(node.attrs?.label || node.attrs?.title || ""));
  });
  return parts.join("");
}

const sorted = (values: string[]) => [...values].sort();
const sameSet = (a: string[], b: string[]) => JSON.stringify(sorted([...new Set(a)])) === JSON.stringify(sorted([...new Set(b)]));

function commentThreads(pageId: string) {
  const threads = db.select({ id: wikiCommentThreads.id, resolvedAt: wikiCommentThreads.resolvedAt })
    .from(wikiCommentThreads).where(eq(wikiCommentThreads.pageId, pageId)).all();
  const exported: Array<{ threadId: string; author: string; date: Date; text: string }> = [];
  let emptyThreads = 0;
  for (const thread of threads.filter((item) => !item.resolvedAt)) {
    const comments = db.select({ body: wikiComments.body, createdAt: wikiComments.createdAt, author: user.name })
      .from(wikiComments).innerJoin(user, eq(user.id, wikiComments.createdBy))
      .where(and(eq(wikiComments.threadId, thread.id), isNull(wikiComments.deletedAt)))
      .orderBy(asc(wikiComments.createdAt)).all();
    if (!comments.length) { emptyThreads++; continue; }
    exported.push({ threadId: thread.id, author: comments[0].author, date: comments[0].createdAt, text: comments.map((comment) => `${comment.author}: ${comment.body}`).join("\n") });
  }
  return { exported, emptyThreads, resolvedThreads: threads.filter((item) => item.resolvedAt).length };
}

export async function planConversion(pageId: string, options: { origin: string; locale?: "de" | "en" }): Promise<ConversionPlan> {
  const row = db.select().from(wikiPages).where(eq(wikiPages.id, pageId)).get();
  if (!row) throw new Error("Page not found");
  const { source, doc, settings } = currentPageDocument(row.id, row.contentJson, row.documentSettingsJson);
  const issues: ConversionIssue[] = [];

  const nodes: Record<string, number> = {};
  const unknownNodes = new Set<string>(), lostMarks = new Set<string>();
  let suggestions = 0, figures = 0;
  walk(doc, (node) => {
    const type = node.type ?? "?";
    nodes[type] = (nodes[type] ?? 0) + 1;
    if (!SUPPORTED_NODES.has(type)) unknownNodes.add(type);
    if (isFigure(type)) figures++;
    for (const mark of node.marks ?? []) {
      if (mark.type === SUGGESTION_INSERT || mark.type === SUGGESTION_DELETE) suggestions++;
      else if (mark.type && !SUPPORTED_MARKS.has(mark.type)) lostMarks.add(mark.type);
    }
  });
  for (const type of unknownNodes) issues.push({ severity: "blocking", code: "unsupportedNode", detail: type });
  if (suggestions) issues.push({ severity: "blocking", code: "unresolvedSuggestion", detail: `${suggestions} suggested change(s) must be accepted or rejected first` });
  for (const mark of lostMarks) issues.push({ severity: "warning", code: "formattingLost", detail: mark });

  const typography = getWikiTypographyForUser(row.createdBy);
  const { images } = await snapshotDocumentImages(row.id, doc, typography, settings);
  if (images.size < figures) issues.push({ severity: "blocking", code: "imageMissing", detail: `${figures - images.size} of ${figures} image(s) could not be read` });

  const threads = commentThreads(row.id);
  if (threads.emptyThreads) issues.push({ severity: "warning", code: "emptyCommentThreads", detail: `${threads.emptyThreads} open thread(s) without comments are not carried over` });

  const german = (options.locale ?? "de") === "de";
  const docx = await generateDocumentDocx(row.title, doc, settings, { figureLabel: german ? "Abbildung" : "Figure", tableLabel: german ? "Tabelle" : "Table" },
    (nodeId) => images.get(nodeId), { origin: options.origin, comments: threads.exported });
  const prepared = prepareDocx(docx);

  const expected = expectedRelations(doc);
  const actual: Relations = {
    citations: prepared.extract.citationSourceIds,
    evidence: prepared.extract.evidenceAnnotationIds,
    slugs: prepared.extract.slugs,
    tasks: prepared.extract.taskIds,
    deadlines: prepared.extract.deadlineIds,
  };
  for (const key of Object.keys(expected) as Array<keyof Relations>) {
    if (!sameSet(expected[key], actual[key])) issues.push({ severity: "blocking", code: "relationMismatch", detail: `${key}: expected ${JSON.stringify(sorted(expected[key]))}, got ${JSON.stringify(sorted(actual[key]))}` });
  }
  const missing = missingWords(`${row.title}\n${comparableText(doc)}`, prepared.extract.text);
  if (missing.length) issues.push({ severity: "blocking", code: "textMismatch", detail: `${missing.length} word(s) missing, e.g. ${missing.slice(0, 8).join(" ")}` });

  return {
    page: { id: row.id, title: row.title, slug: row.slug },
    source, nodes, expected, actual,
    comments: { exported: threads.exported.length, emptyThreads: threads.emptyThreads, resolvedThreads: threads.resolvedThreads },
    images: { total: figures, resolved: images.size },
    issues,
    ok: !issues.some((issue) => issue.severity === "blocking"),
    prepared,
  };
}
