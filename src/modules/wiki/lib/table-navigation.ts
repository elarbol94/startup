// Keyboard navigation between the cells of the wiki's markdown tables: Tab moves to the
// next cell (adding a row after the last one) and Shift+Tab to the previous cell, like a
// word processor. Pure ProseMirror state functions, wired up by table-keyboard.ts.
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { tableDepth } from "./block-insert-position";

type Cell = { position: number; node: ProseMirrorNode };

function tableCells(table: ProseMirrorNode, tablePosition: number) {
  const cells: Cell[] = [];
  table.forEach((row, rowOffset) => {
    row.forEach((cell, cellOffset) => {
      cells.push({ position: tablePosition + 1 + rowOffset + 1 + cellOffset, node: cell });
    });
  });
  return cells;
}

/** Selects the whole text of a cell, or places the caret in it when it is empty. */
function selectCell(tr: Transaction, cellPosition: number) {
  const cell = tr.doc.nodeAt(cellPosition);
  if (!cell) return tr;
  const start = TextSelection.findFrom(tr.doc.resolve(cellPosition + 1), 1, true);
  const end = TextSelection.findFrom(tr.doc.resolve(cellPosition + cell.nodeSize - 1), -1, true);
  if (!start || !end) return tr;
  return tr.setSelection(TextSelection.create(tr.doc, start.from, Math.max(start.from, end.to))).scrollIntoView();
}

/** The table and cell around the selection, or null outside a table cell. */
export function currentTableCell(state: EditorState) {
  const { $from } = state.selection;
  const depth = tableDepth($from);
  if (depth === null || depth + 2 > $from.depth) return null;
  const table = $from.node(depth);
  const tablePosition = $from.before(depth);
  const cells = tableCells(table, tablePosition);
  const cellPosition = $from.before(depth + 2);
  const index = cells.findIndex((cell) => cell.position === cellPosition);
  return index < 0 ? null : { table, tablePosition, cells, index };
}

/**
 * Moves the selection to the next (`direction` 1) or previous (-1) cell. Tab in the last
 * cell appends a row of empty body cells that keep each column's width and alignment.
 * Returns null when the selection is not in a table cell.
 */
export function moveToTableCell(state: EditorState, direction: 1 | -1): Transaction | null {
  const current = currentTableCell(state);
  if (!current) return null;
  const { table, tablePosition, cells, index } = current;
  const target = cells[index + direction];
  if (target) return selectCell(state.tr, target.position);
  if (direction < 0) return state.tr;
  const { schema } = state;
  const cellType = schema.nodes.markdownTableCell;
  const rowType = schema.nodes.markdownTableRow;
  const lastRow = table.lastChild;
  if (!cellType || !rowType || !lastRow) return state.tr;
  const newCells: ProseMirrorNode[] = [];
  lastRow.forEach((cell) => {
    newCells.push(cellType.create({ widthPercent: cell.attrs.widthPercent ?? null, alignment: cell.attrs.alignment ?? "left" }, schema.nodes.paragraph.create()));
  });
  const rowPosition = tablePosition + table.nodeSize - 1;
  const tr = state.tr.insert(rowPosition, rowType.create(null, newCells));
  return selectCell(tr, rowPosition + 1);
}
