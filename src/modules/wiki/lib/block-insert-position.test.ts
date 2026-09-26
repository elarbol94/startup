import { getSchema, Node } from "@tiptap/core";
import { Fragment, Slice, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import { MarkdownDocumentExtensions, MarkdownShortcutMarks } from "../components/markdown-shortcut-extension";
import { isInsideTable, resolveBlockInsertPosition } from "./block-insert-position";
import { dropFigureInTable } from "./figure-drop";
import { moveToTableCell } from "./table-navigation";

const CommentableImage = Node.create({ name: "commentableImage", group: "block", atom: true, addAttributes: () => ({ nodeId: { default: "" } }) });
const MermaidDiagram = Node.create({ name: "mermaidDiagram", group: "block", atom: true });

const schema = getSchema([
  StarterKit.configure({ bold: false, code: false, italic: false, strike: false }),
  ...MarkdownShortcutMarks,
  ...MarkdownDocumentExtensions,
  CommentableImage,
  MermaidDiagram,
]);
const { nodes } = schema;

const paragraph = (text = "") => nodes.paragraph.create(null, text ? schema.text(text) : undefined);
const cell = (text: string, type = nodes.markdownTableCell) => type.create({ alignment: "center", widthPercent: 40 }, paragraph(text));
/** A 2×2 table (header row + one body row) between two paragraphs. */
function documentWithTable(cells = ["q1", "q2", "q3", "q4"]) {
  const table = nodes.markdownTable.create(null, [
    nodes.markdownTableRow.create(null, [cell(cells[0], nodes.markdownTableHeader), cell(cells[1], nodes.markdownTableHeader)]),
    nodes.markdownTableRow.create(null, [cell(cells[2]), cell(cells[3])]),
  ]);
  return nodes.doc.create(null, [paragraph("Before"), table, paragraph("After")]);
}
/** Position of the first occurrence of `text`, plus `offset` characters. */
function positionOf(doc: ProseMirrorNode, text: string, offset = 0) {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(text)) found = pos + node.text.indexOf(text) + offset;
  });
  return found;
}
function tables(doc: ProseMirrorNode) {
  const found: ProseMirrorNode[] = [];
  doc.forEach((node) => { if (node.type.name === "markdownTable") found.push(node); });
  return found;
}
function stateAt(doc: ProseMirrorNode, position: number) {
  return EditorState.create({ schema, doc, selection: TextSelection.create(doc, position) });
}
const selectedCellText = (state: EditorState) => state.selection.$from.parent.textContent;

describe("resolveBlockInsertPosition", () => {
  const doc = documentWithTable();
  const tableStart = doc.child(0).nodeSize;
  const tableEnd = tableStart + doc.child(1).nodeSize;

  it("keeps positions outside tables unchanged", () => {
    const inParagraph = positionOf(doc, "Before", 3);
    expect(resolveBlockInsertPosition(doc, inParagraph, nodes.commentableImage)).toBe(inParagraph);
    expect(resolveBlockInsertPosition(doc, tableEnd, nodes.commentableImage)).toBe(tableEnd);
    expect(isInsideTable(doc, inParagraph)).toBe(false);
  });

  it("moves figures, diagrams and other blocks after the table when cells only hold paragraphs", () => {
    for (const text of ["q1", "q2", "q3", "q4"]) {
      const inCell = positionOf(doc, text, 1);
      expect(isInsideTable(doc, inCell)).toBe(true);
      for (const type of [nodes.commentableImage, nodes.mermaidDiagram, nodes.horizontalRule, nodes.codeBlock, nodes.markdownTable]) {
        expect(resolveBlockInsertPosition(doc, inCell, type)).toBe(tableEnd);
      }
      expect(resolveBlockInsertPosition(doc, inCell)).toBe(tableEnd);
    }
  });

  it("inserts into the cell after the caret's block when the cell accepts the type", () => {
    const inCell = positionOf(doc, "q3", 1);
    const $pos = doc.resolve(inCell);
    expect(resolveBlockInsertPosition(doc, inCell, nodes.paragraph)).toBe($pos.after($pos.depth));
    // Mixed content: one type the cell rejects sends everything after the table.
    expect(resolveBlockInsertPosition(doc, inCell, [nodes.paragraph, nodes.commentableImage])).toBe(tableEnd);
  });

  it("clamps out-of-range positions", () => {
    expect(resolveBlockInsertPosition(doc, 10_000, nodes.commentableImage)).toBe(doc.content.size);
    expect(resolveBlockInsertPosition(doc, -5, nodes.commentableImage)).toBe(0);
  });

  it("keeps the table whole when a figure is inserted at the resolved position", () => {
    const at = resolveBlockInsertPosition(doc, positionOf(doc, "q1", 1), nodes.commentableImage);
    const next = stateAt(doc, 1).tr.insert(at, nodes.commentableImage.create({ nodeId: "figure" })).doc;
    expect(tables(next)).toHaveLength(1);
    expect(tables(next)[0].textContent).toBe("q1q2q3q4");
    expect(next.child(2).type.name).toBe("commentableImage");
  });
});

describe("dropFigureInTable", () => {
  it("moves a dragged figure after the table instead of splitting it", () => {
    const figure = nodes.commentableImage.create({ nodeId: "moved" });
    const base = documentWithTable();
    const doc = nodes.doc.create(null, [figure, ...Array.from({ length: base.childCount }, (_, index) => base.child(index))]);
    const state = stateAt(doc, positionOf(doc, "Before"));
    const transaction = dropFigureInTable(state, positionOf(doc, "q2", 1), new Slice(Fragment.from(figure), 0, 0), true)!;
    expect(transaction).not.toBeNull();
    const names = Array.from({ length: transaction.doc.childCount }, (_, index) => transaction.doc.child(index).type.name);
    expect(names).toEqual(["paragraph", "markdownTable", "commentableImage", "paragraph"]);
    expect(tables(transaction.doc)[0].textContent).toBe("q1q2q3q4");
  });

  it("ignores drops outside tables", () => {
    const doc = documentWithTable();
    const figure = nodes.commentableImage.create({ nodeId: "x" });
    expect(dropFigureInTable(stateAt(doc, 1), positionOf(doc, "After", 2), new Slice(Fragment.from(figure), 0, 0), false)).toBeNull();
  });
});

describe("moveToTableCell", () => {
  it("moves forward and backward through the cells in reading order", () => {
    const doc = documentWithTable();
    let state = stateAt(doc, positionOf(doc, "q1", 1));
    const visited: string[] = [];
    for (let step = 0; step < 3; step += 1) {
      state = state.apply(moveToTableCell(state, 1)!);
      visited.push(selectedCellText(state));
    }
    expect(visited).toEqual(["q2", "q3", "q4"]);
    // The target cell's text is selected, so typing replaces it like in a word processor.
    expect(state.doc.textBetween(state.selection.from, state.selection.to)).toBe("q4");
    state = state.apply(moveToTableCell(state, -1)!);
    expect(selectedCellText(state)).toBe("q3");
  });

  it("puts the caret into an empty target cell", () => {
    const doc = documentWithTable(["q1", "", "", ""]);
    const state = stateAt(doc, positionOf(doc, "q1", 1));
    const next = state.apply(moveToTableCell(state, 1)!);
    expect(next.selection.empty).toBe(true);
    expect(next.selection.$from.node(next.selection.$from.depth - 1).type.name).toBe("markdownTableHeader");
  });

  it("adds a body row after the last cell and stays at the first cell with Shift+Tab", () => {
    const doc = documentWithTable();
    let state = stateAt(doc, positionOf(doc, "q4", 1));
    state = state.apply(moveToTableCell(state, 1)!);
    const [table] = tables(state.doc);
    expect(tables(state.doc)).toHaveLength(1);
    expect(table.childCount).toBe(3);
    const row = table.child(2);
    expect(row.childCount).toBe(2);
    row.forEach((newCell) => {
      expect(newCell.type.name).toBe("markdownTableCell");
      expect(newCell.attrs).toMatchObject({ alignment: "center", widthPercent: 40 });
    });
    expect(state.selection.$from.node(state.selection.$from.depth - 2)).toBe(row);
    expect(state.selection.$from.index(state.selection.$from.depth - 2)).toBe(0);

    const first = stateAt(doc, positionOf(doc, "q1", 1));
    const unchanged = moveToTableCell(first, -1)!;
    expect(unchanged.docChanged).toBe(false);
  });

  it("returns null outside tables", () => {
    const doc = documentWithTable();
    expect(moveToTableCell(stateAt(doc, 2), 1)).toBeNull();
  });
});
