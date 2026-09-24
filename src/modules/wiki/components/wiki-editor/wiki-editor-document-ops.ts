// ProseMirror document helpers for the wiki editor: citation numbering and labels, comment
// thread marks, inline image node attributes and PDF evidence content. Used by wiki-editor.tsx.
import type { Editor } from "@tiptap/react";
import { formatIeeeCitation, formatInlineCitation, isNumericCitationStyle, type CitationSource, type CitationStyle } from "../../lib/citations";
import { mergeCommentThreadIds } from "../../lib/comment-anchors";
import { figureMime } from "../../lib/figure";
import type { EvidenceRef, UploadedAttachment } from "./wiki-editor-types";

export function citationNumberForSource(editor: Editor, sourceId: string) {
  const order = new Map<string, number>();
  editor.state.doc.descendants((node) => {
    if (node.type.name !== "citation" || !Array.isArray(node.attrs.items)) return;
    for (const item of node.attrs.items as Array<{ sourceId?: unknown }>) {
      if (typeof item.sourceId === "string" && !order.has(item.sourceId)) order.set(item.sourceId, order.size + 1);
    }
  });
  return order.get(sourceId) ?? order.size + 1;
}

export function normalizeCitationLabels(
  editor: Editor,
  sources: CitationSource[],
  style: CitationStyle,
  locale: string,
) {
  const order = new Map<string, number>();
  const updates: Array<{ position: number; attrs: Record<string, unknown> }> = [];
  editor.state.doc.descendants((node, position) => {
    if (node.type.name !== "citation" || !Array.isArray(node.attrs.items)) return;
    const labels: string[] = [];
    for (const item of node.attrs.items as Array<{ sourceId?: unknown; locator?: unknown }>) {
      if (typeof item.sourceId !== "string") continue;
      if (!order.has(item.sourceId)) order.set(item.sourceId, order.size + 1);
      const locator = typeof item.locator === "string" ? item.locator : undefined;
      if (isNumericCitationStyle(style)) {
        labels.push(formatIeeeCitation(order.get(item.sourceId)!, locator));
        continue;
      }
      const source = sources.find((candidate) => candidate.id === item.sourceId);
      labels.push(source
        ? formatInlineCitation(source, locator, locale, order.get(item.sourceId)!, style)
        : formatIeeeCitation(order.get(item.sourceId)!, locator));
    }
    const label = labels.join(", ");
    if (label && node.attrs.label !== label) updates.push({ position, attrs: { ...node.attrs, label } });
  });
  if (!updates.length) return false;
  const transaction = editor.state.tr;
  for (const update of updates) transaction.setNodeMarkup(update.position, undefined, update.attrs);
  editor.view.dispatch(transaction);
  return true;
}

export function addThreadMark(editor: Editor, range: { from: number; to: number }, threadId: string) {
  const markType = editor.state.schema.marks.comment;
  if (!markType) return;
  const transaction = editor.state.tr;
  editor.state.doc.nodesBetween(range.from, range.to, (node, position) => {
    if (!node.isText) return;
    const from = Math.max(range.from, position);
    const to = Math.min(range.to, position + node.nodeSize);
    if (from >= to) return;
    const existing = node.marks.find((mark) => mark.type === markType);
    const threadIds = mergeCommentThreadIds(existing?.attrs ?? {}, threadId);
    transaction.removeMark(from, to, markType);
    transaction.addMark(from, to, markType.create({ threadId: null, threadIds }));
  });
  editor.view.dispatch(transaction);
}

export function backfillCommentNodeIds(editor: Editor) {
  let transaction = editor.state.tr;
  editor.state.doc.descendants((node, position) => {
    if ((node.type.name === "pdfEvidence" || node.type.name === "commentableImage") && !node.attrs.nodeId) {
      transaction = transaction.setNodeMarkup(position, undefined, { ...node.attrs, nodeId: crypto.randomUUID() });
    }
  });
  if (transaction.docChanged) editor.view.dispatch(transaction);
}

const INLINE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

export function isInlineImageFile(file: File) {
  return INLINE_IMAGE_TYPES.has(file.type) || Boolean(figureMime(file.name));
}

export function normalizeInlineImageFile(file: File) {
  return !file.type && file.name.toLocaleLowerCase().endsWith(".svg")
    ? new File([file], file.name, { type: "image/svg+xml", lastModified: file.lastModified })
    : file;
}

export function imageNodeAttrs(attachment: UploadedAttachment) {
  const label = attachment.fileName.replace(/\.[^.]+$/, "");
  return {
    nodeId: crypto.randomUUID(),
    attachmentId: attachment.id,
    src: `/api/files/${attachment.id}`,
    alt: label,
    caption: "",
    numbered: true,
    includeInFigureIndex: true,
    widthPercent: 100,
    alignment: "center",
    cropX: 50,
    cropY: 50,
  };
}

/** The evidence block plus its citation, shared by the picker and the reader hand-off. */
export function evidenceInsertContent(item: EvidenceRef, locale: string) {
    const pageLabel = locale.startsWith("de") ? "S." : "p.";
    return [
      {
        type: "pdfEvidence",
        attrs: {
          nodeId: crypto.randomUUID(),
          annotationId: item.id,
          sourceId: item.sourceId,
          documentId: item.documentId,
          pageNumber: item.pageNumber,
          kind: item.kind,
          quote: item.selectedText,
          label: item.label || item.note,
          sourceTitle: item.sourceTitle,
          previewUrl: item.kind === "region" ? "/api/wiki/pdf-annotations/" + item.id + "/preview" : "",
        },
      },
      {
        type: "paragraph",
        content: [{
          type: "citation",
          attrs: {
            items: [{ sourceId: item.sourceId, documentId: item.documentId, annotationId: item.id, locator: String(item.pageNumber), locatorType: "page" }],
            label: `(${item.sourceTitle}, ${pageLabel} ${item.pageNumber})`,
          },
        }],
      },
    ];
}
