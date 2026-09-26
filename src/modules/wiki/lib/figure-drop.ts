import { Fragment, type Node as ProseMirrorNode, type Slice } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import { NodeSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { isInsideTable, resolveBlockInsertPosition } from "./block-insert-position";
import { isFigure } from "./figure";

export function draggedFigure(slice: Slice | undefined): ProseMirrorNode | null {
  const node = slice?.content.firstChild;
  return slice && !slice.openStart && !slice.openEnd && slice.content.childCount === 1 && node && isFigure(node.type.name) ? node : null;
}

/** Split only paragraphs that can contain a figure alongside both text halves. */
export function canDropFigureInText(doc: ProseMirrorNode, position: number, figure: ProseMirrorNode) {
  if (position < 0 || position > doc.content.size) return false;
  const $pos = doc.resolve(position);
  if ($pos.parent.type.name !== "paragraph" || !$pos.parentOffset || $pos.parentOffset === $pos.parent.content.size) return false;
  const paragraph = $pos.parent;
  const replacement = Fragment.fromArray([paragraph.copy(paragraph.content.cut(0, $pos.parentOffset)), figure, paragraph.copy(paragraph.content.cut($pos.parentOffset))]);
  const index = $pos.index($pos.depth - 1);
  return $pos.node($pos.depth - 1).canReplace(index, index + 1, replacement);
}

/** Removes the dragged figure from its old place (move) or makes a fresh copy of it. */
function takeDraggedFigure(state: EditorState, transaction: Transaction, dragged: ProseMirrorNode, move: boolean) {
  if (!move) return dragged.type.create({ ...dragged.attrs, nodeId: crypto.randomUUID() }, dragged.content, dragged.marks);
  let source: { position: number; node: ProseMirrorNode } | undefined;
  state.doc.descendants((node, pos) => {
    if (dragged.attrs.nodeId && node.type === dragged.type && node.attrs.nodeId === dragged.attrs.nodeId) source = { position: pos, node };
  });
  // Never remove an unrelated selection if it changed during the drag.
  if (!source) return null;
  transaction.delete(source.position, source.position + source.node.nodeSize);
  return source.node;
}

/** One undoable move at the exact caret, without ProseMirror's block-boundary snapping. */
export function dropFigureInText(state: EditorState, position: number, slice: Slice, move: boolean) {
  const dragged = draggedFigure(slice);
  if (!dragged || !canDropFigureInText(state.doc, position, dragged)) return null;
  const transaction = closeHistory(state.tr);
  const figure = takeDraggedFigure(state, transaction, dragged, move);
  if (!figure) return null;
  const at = transaction.mapping.map(position);
  if (!canDropFigureInText(transaction.doc, at, figure)) return null;
  const $pos = transaction.doc.resolve(at);
  const before = $pos.parent.copy($pos.parent.content.cut(0, $pos.parentOffset));
  const after = $pos.parent.copy($pos.parent.content.cut($pos.parentOffset));
  const start = $pos.before();
  transaction.replaceWith(start, $pos.after(), Fragment.fromArray([before, figure, after]));
  return transaction.setSelection(NodeSelection.create(transaction.doc, start + before.nodeSize)).setMeta("uiEvent", "drop").scrollIntoView();
}

/** A figure dropped onto a table cell lands after the table instead of splitting it. */
export function dropFigureInTable(state: EditorState, position: number, slice: Slice, move: boolean) {
  const dragged = draggedFigure(slice);
  if (!dragged || !isInsideTable(state.doc, position)) return null;
  const transaction = closeHistory(state.tr);
  const figure = takeDraggedFigure(state, transaction, dragged, move);
  if (!figure) return null;
  const at = resolveBlockInsertPosition(transaction.doc, transaction.mapping.map(position), figure.type);
  transaction.insert(at, figure);
  return transaction.setSelection(NodeSelection.create(transaction.doc, at)).setMeta("uiEvent", "drop").scrollIntoView();
}
