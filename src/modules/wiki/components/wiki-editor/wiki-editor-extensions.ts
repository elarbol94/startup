// Custom Tiptap nodes and marks registered by the wiki editor: citations, PDF evidence,
// task/deadline references, comment anchors and author highlights. Used by wiki-editor.tsx.
import { Mark, Node, mergeAttributes } from "@tiptap/core";
import { userIdentityColor } from "@/lib/user-mark-colors";
import { mergeCommentThreadIds } from "../../lib/comment-anchors";

export const Citation = Node.create({
  name: "citation", group: "inline", inline: true, atom: true,
  addAttributes() { return { items: { default: [] }, label: { default: "" } }; },
  parseHTML() { return [{ tag: "span[data-citation]" }]; },
  renderHTML({ HTMLAttributes }) { return ["span", mergeAttributes(HTMLAttributes, { "data-citation": "", class: "wiki-citation" }), HTMLAttributes.label || "(citation)"]; },
});

export const PdfEvidence = Node.create({
  name: "pdfEvidence", group: "block", atom: true, selectable: true,
  addAttributes() { return { nodeId: { default: "" }, annotationId: { default: "" }, sourceId: { default: "" }, documentId: { default: "" }, pageNumber: { default: 1 }, kind: { default: "text" }, quote: { default: "" }, label: { default: "" }, sourceTitle: { default: "" }, previewUrl: { default: "" } }; },
  parseHTML() { return [{ tag: "aside[data-pdf-evidence]" }, { tag: "figure[data-pdf-evidence]" }]; },
  renderHTML({ HTMLAttributes }) {
    const text = HTMLAttributes.quote || HTMLAttributes.label || HTMLAttributes.sourceTitle || "PDF evidence";
    const attributes = mergeAttributes(HTMLAttributes, { "data-pdf-evidence": HTMLAttributes.annotationId, "data-comment-node-id": HTMLAttributes.nodeId, class: "wiki-commentable-media my-4 rounded-lg border-l-4 border-indigo-400 bg-indigo-50/60 p-4 text-sm dark:bg-indigo-950/20" });
    if (HTMLAttributes.kind === "region" && HTMLAttributes.previewUrl) return ["figure", attributes, ["img", { src: HTMLAttributes.previewUrl, alt: text, class: "max-h-96 rounded object-contain" }], ["figcaption", { class: "mt-2 text-xs text-muted-foreground" }, text]];
    return ["aside", attributes, text];
  },
});

function referencePeople(value: unknown, fallback: string): import("@tiptap/pm/model").DOMOutputSpec[] {
  const people = Array.isArray(value) ? value.filter((person): person is { id: string; name: string } =>
    person !== null && typeof person === "object" && typeof person.id === "string" && typeof person.name === "string") : [];
  if (!people.length) return fallback ? [["small", {}, fallback]] : [];
  return people.map(person => ["span", {
    "data-user-id": person.id,
    style: `display:inline-flex;align-items:center;border-left:3px solid ${userIdentityColor(person.id)};background:${userIdentityColor(person.id, "highlight")};padding:1px 5px;margin-right:4px;border-radius:3px`,
  }, person.name]);
}

export const TaskReference = Node.create({
  name: "taskReference",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      taskId: { default: "" },
      title: { default: "" },
      status: { default: "open" },
      priority: { default: "medium" },
      assigneeName: { default: "" },
      assignees: { default: [], rendered: false },
    };
  },
  parseHTML() { return [{ tag: "aside[data-task-reference]" }]; },
  renderHTML({ node, HTMLAttributes }) {
    const done = HTMLAttributes.status === "done";
    return ["aside", mergeAttributes(HTMLAttributes, {
      "data-task-reference": HTMLAttributes.taskId,
      "data-status": HTMLAttributes.status,
      "data-priority": HTMLAttributes.priority,
      class: "wiki-task-reference",
    }),
      ["span", { class: "wiki-task-reference-check" }, done ? "✓" : ""],
      ["span", { class: "wiki-task-reference-body" },
        ["strong", {}, HTMLAttributes.title || "Aufgabe"],
        ["small", {}, HTMLAttributes.priority || ""],
        ...referencePeople(node.attrs.assignees, HTMLAttributes.assigneeName),
      ],
    ];
  },
});

export const DeadlineReference = Node.create({
  name: "deadlineReference",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      deadlineId: { default: "" },
      title: { default: "" },
      description: { default: "" },
      status: { default: "open" },
      assigneeName: { default: "" },
      assignees: { default: [], rendered: false },
      deadlineAt: { default: "" },
    };
  },
  parseHTML() { return [{ tag: "aside[data-deadline-reference]" }]; },
  renderHTML({ node, HTMLAttributes }) {
    const done = HTMLAttributes.status === "done";
    return ["aside", mergeAttributes(HTMLAttributes, {
      "data-deadline-reference": HTMLAttributes.deadlineId,
      "data-status": HTMLAttributes.status,
      class: "wiki-deadline-reference",
    }),
      ["span", { class: "wiki-deadline-reference-icon" }, done ? "✓" : "◷"],
      ["span", { class: "wiki-deadline-reference-body" },
        ["strong", {}, HTMLAttributes.title || "Deadline"],
        ["small", {}, HTMLAttributes.deadlineAt || ""],
        ...referencePeople(node.attrs.assignees, HTMLAttributes.assigneeName),
      ],
    ];
  },
});

export const CommentMark = Mark.create({
  name: "comment", inclusive: false,
  addAttributes() {
    return {
      threadId: { default: null, parseHTML: (element) => element.getAttribute("data-comment-thread") },
      threadIds: {
        default: [],
        parseHTML: (element) => {
          const ids = (element.getAttribute("data-comment-threads") ?? "").split(/\s+/).filter(Boolean);
          const legacy = element.getAttribute("data-comment-thread");
          if (legacy && !ids.includes(legacy)) ids.unshift(legacy);
          return ids;
        },
      },
    };
  },
  parseHTML() { return [{ tag: "mark[data-comment-thread]" }, { tag: "mark[data-comment-threads]" }]; },
  renderHTML({ HTMLAttributes }) {
    const ids = mergeCommentThreadIds(HTMLAttributes, "");
    const normalized = ids.filter(Boolean);
    return ["mark", { "data-comment-thread": normalized[0], "data-comment-threads": normalized.join(" "), class: "wiki-comment-anchor" }, 0];
  },
});

export const Highlight = Mark.create({
  name: "highlight",
  addAttributes() {
    return {
      createdBy: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-highlight-author"),
        renderHTML: (attributes) => attributes.createdBy ? { "data-highlight-author": attributes.createdBy } : {},
      },
    };
  },
  parseHTML() { return [{ tag: "mark:not([data-comment-thread])" }]; },
  renderHTML({ HTMLAttributes }) { return ["mark", mergeAttributes(HTMLAttributes, { class: "wiki-highlight" }), 0]; },
});
