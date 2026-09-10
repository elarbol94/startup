import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node } from "@tiptap/pm/model";
import { mergeCommentThreadIds } from "../lib/comment-anchors";
import { userMarkColorStyle, type UserMarkColor } from "@/lib/user-mark-colors";

export type CommentHighlightThread = {
  id: string;
  resolvedAt: unknown;
  createdBy: string;
  createdByMarkColor: UserMarkColor;
  comments: readonly { id: string }[];
};
type HighlightState = { threads: readonly CommentHighlightThread[]; activeThreadId: string | null };
export const commentHighlightKey = new PluginKey<HighlightState>("wikiCommentHighlights");

export function commentHighlightDecorations(doc: Node, { threads, activeThreadId }: HighlightState) {
  const liveThreads = new Map(threads.filter((thread) => thread.comments.length > 0).map((thread) => [thread.id, thread]));
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    const mark = node.marks.find((mark) => mark.type.name === "comment");
    if (!mark) return;
    const matches = mergeCommentThreadIds(mark.attrs, "").flatMap((id) => {
      const thread = liveThreads.get(id);
      return thread ? [thread] : [];
    });
    const thread = matches.find((thread) => thread.id === activeThreadId) ?? matches[0];
    if (!thread) return;
    const active = matches.some((thread) => thread.id === activeThreadId);
    const resolved = matches.every((thread) => !!thread.resolvedAt);
    decorations.push(Decoration.inline(pos, pos + node.nodeSize, {
      class: `wiki-comment-highlight${active ? " is-active" : ""}${resolved ? " is-resolved" : ""}`,
      style: Object.entries(userMarkColorStyle(thread.createdByMarkColor, thread.createdBy)).map(([key, value]) => `${key}:${value}`).join(";"),
    }));
  });
  return DecorationSet.create(doc, decorations);
}

export const CommentHighlights = Extension.create({
  name: "commentHighlights",
  addProseMirrorPlugins() {
    return [new Plugin<HighlightState>({
      key: commentHighlightKey,
      state: {
        init: () => ({ threads: [], activeThreadId: null }),
        apply: (tr, previous) => tr.getMeta(commentHighlightKey) ?? previous,
      },
      props: {
        decorations: (state) => commentHighlightDecorations(state.doc, commentHighlightKey.getState(state)!),
      },
    })];
  },
});
