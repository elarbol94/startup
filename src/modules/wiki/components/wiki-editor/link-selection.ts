// Keeps the text range a link is being entered for while focus sits in the URL
// field. Focus leaving the editor (toolbar, bubble menu, Ctrl+K, command
// palette) can move or collapse the editor selection, so the range is captured
// before the link input opens, carried through local and collaborative edits,
// highlighted as a decoration and applied from here instead of the selection.
import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { anchorRange, applyToAnchoredRange, type AnchoredRange, type DocumentRange } from "./yjs-anchor";

type PendingLinkAction = { set: DocumentRange } | { clear: true };
export const pendingLinkKey = new PluginKey<AnchoredRange | null>("wikiPendingLink");
export const PENDING_LINK_CLASS = "wiki-pending-link";

export const PendingLinkRange = Extension.create({
  name: "wikiPendingLink",
  addProseMirrorPlugins() {
    return [new Plugin<AnchoredRange | null>({
      key: pendingLinkKey,
      state: {
        init: () => null,
        apply(transaction, value, _previous, next) {
          const action = transaction.getMeta(pendingLinkKey) as PendingLinkAction | undefined;
          if (action && "clear" in action) return null;
          if (action) return anchorRange(next, action.set);
          return value ? applyToAnchoredRange(value, transaction, next) : null;
        },
      },
      props: {
        decorations(state) {
          const range = pendingLinkKey.getState(state);
          if (!range || range.from >= range.to) return null;
          return DecorationSet.create(state.doc, [Decoration.inline(range.from, range.to, { class: PENDING_LINK_CLASS })]);
        },
      },
    })];
  },
});

export function pendingLinkRange(state: EditorState): DocumentRange | null {
  const range = pendingLinkKey.getState(state);
  return range ? { from: range.from, to: range.to } : null;
}

/** Remembers the selection (or the given range) as the target of the link being entered. */
export function capturePendingLink(editor: Editor, range: DocumentRange = editor.state.selection): DocumentRange {
  const { from, to } = range;
  if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(pendingLinkKey, { set: { from, to } } satisfies PendingLinkAction).setMeta("addToHistory", false));
  return pendingLinkRange(editor.state) ?? { from, to };
}

export function clearPendingLink(editor: Editor) {
  if (editor.isDestroyed || !pendingLinkKey.getState(editor.state)) return;
  editor.view.dispatch(editor.state.tr.setMeta(pendingLinkKey, { clear: true } satisfies PendingLinkAction).setMeta("addToHistory", false));
}
