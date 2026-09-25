// Lets Backspace or Ctrl/Cmd+Z right after a Markdown auto-conversion restore the
// literal text that was typed ("# ", "**bold**", "[x](url) " ...).
//
// TipTap's own undoInputRule forgets the conversion as soon as any appended
// transaction changes the document (for example HeadingIdentity assigning an id
// to a new heading), and the Yjs undo manager groups everything typed within its
// capture window. This plugin remembers the conversion together with the
// transactions appended to it and inverts exactly those steps.
import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import type { Transform } from "@tiptap/pm/transform";

export type MarkdownConversionMeta = {
  /** Position where the triggering text would have been inserted. */
  from: number;
  to: number;
  /** Text that triggered the conversion and is restored after undoing it. */
  text: string;
};

type ConversionRecord = MarkdownConversionMeta & { transforms: Transform[] };

export const markdownConversionUndoKey = new PluginKey<ConversionRecord | null>("markdownConversionUndo");

/** Marks `transaction` as an undoable Markdown conversion (used by the Space/Enter shortcuts). */
export function markMarkdownConversion(transaction: Transaction, meta: MarkdownConversionMeta) {
  transaction.setMeta(markdownConversionUndoKey, meta);
}

function inputRuleMeta(transaction: Transaction, state: EditorState): MarkdownConversionMeta | null {
  for (const plugin of state.plugins) {
    if (!(plugin.spec as { isInputRules?: boolean }).isInputRules) continue;
    const meta = transaction.getMeta(plugin) as Partial<MarkdownConversionMeta> | undefined;
    if (meta && typeof meta.from === "number" && typeof meta.to === "number") {
      // Enter-triggered rules (``` + Enter) report "\n"; restoring it would insert a hard newline.
      return { from: meta.from, to: meta.to, text: meta.text === "\n" ? "" : String(meta.text ?? "") };
    }
  }
  return null;
}

export function markdownConversionUndoPlugin() {
  return new Plugin<ConversionRecord | null>({
    key: markdownConversionUndoKey,
    state: {
      init: () => null,
      apply(transaction, previous, _oldState, newState) {
        if (transaction.getMeta(markdownConversionUndoKey) === "undone") return null;
        const meta = (transaction.getMeta(markdownConversionUndoKey) as MarkdownConversionMeta | undefined)
          ?? inputRuleMeta(transaction, newState);
        if (meta && transaction.docChanged) return { ...meta, transforms: [transaction] };
        if (!previous) return null;
        // Follow-up fixes appended to the conversion belong to it (heading ids, figure repairs ...).
        if (transaction.getMeta("appendedTransaction")) {
          return transaction.docChanged ? { ...previous, transforms: [...previous.transforms, transaction] } : previous;
        }
        // Anything else - further typing, cursor moves, remote Yjs updates - ends the undo window.
        return transaction.docChanged || transaction.selectionSet ? null : previous;
      },
    },
  });
}

/** The transaction restoring the literal Markdown of the latest conversion, or null when there is none. */
export function markdownConversionUndoTransaction(state: EditorState): Transaction | null {
  const record = markdownConversionUndoKey.getState(state);
  if (!record) return null;
  const transaction = state.tr;
  try {
    for (const transform of [...record.transforms].reverse()) {
      for (let index = transform.steps.length - 1; index >= 0; index -= 1) {
        transaction.step(transform.steps[index].invert(transform.docs[index]));
      }
    }
    if (record.text) {
      transaction.replaceWith(record.from, record.to, state.schema.text(record.text, transaction.doc.resolve(record.from).marks()));
    } else if (record.to > record.from) transaction.delete(record.from, record.to);
    transaction.setSelection(TextSelection.create(transaction.doc, record.from + record.text.length));
  } catch {
    // The document no longer matches the recorded steps; fall back to the regular undo.
    return null;
  }
  return transaction.setMeta(markdownConversionUndoKey, "undone");
}

/** Reverts the Markdown conversion that just happened. Returns false when there is none. */
export function undoMarkdownConversion(editor: Editor) {
  if (!editor.isEditable) return false;
  const transaction = markdownConversionUndoTransaction(editor.state);
  if (!transaction) return false;
  editor.view.dispatch(transaction.scrollIntoView());
  return true;
}

export const MarkdownConversionUndo = Extension.create({
  name: "markdownConversionUndo",
  // Above Collaboration (1000), whose Mod-z would undo the whole Yjs capture group.
  priority: 1_100,
  addProseMirrorPlugins() {
    return [markdownConversionUndoPlugin()];
  },
  addKeyboardShortcuts() {
    return {
      "Mod-z": () => undoMarkdownConversion(this.editor),
      Backspace: () => undoMarkdownConversion(this.editor),
    };
  },
});
