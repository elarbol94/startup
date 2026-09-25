// Where a block node (figure, Mermaid diagram, rule, evidence, table, ...) may be inserted
// without breaking the structure around the caret. Inserting a block into a table cell
// that only accepts paragraphs makes ProseMirror close the cell, row and table, which
// splits one table into two with the block between them. Every block insertion path of
// the wiki editor resolves its position here first.
import type { ChainedCommands, JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode, NodeType, ResolvedPos } from "@tiptap/pm/model";

type BlockTypes = NodeType | readonly NodeType[] | null | undefined;

function isTableNode(node: ProseMirrorNode) {
  return node.type.name === "markdownTable" || node.type.spec.tableRole === "table";
}

/** Depth of the outermost table around `$pos`, or null outside tables. */
export function tableDepth($pos: ResolvedPos) {
  for (let depth = 1; depth <= $pos.depth; depth += 1) if (isTableNode($pos.node(depth))) return depth;
  return null;
}

export function isInsideTable(doc: ProseMirrorNode, position: number) {
  return tableDepth(doc.resolve(Math.max(0, Math.min(position, doc.content.size)))) !== null;
}

/**
 * The position at which block content of `types` can be inserted for a caret at
 * `position`. Outside tables the position is returned unchanged. Inside a table the
 * block goes into the cell after the caret's block when the cell's content expression
 * accepts every type, and otherwise directly after the whole table.
 */
export function resolveBlockInsertPosition(doc: ProseMirrorNode, position: number, types?: BlockTypes) {
  const clamped = Math.max(0, Math.min(position, doc.content.size));
  const $pos = doc.resolve(clamped);
  const table = tableDepth($pos);
  if (table === null) return clamped;
  const cellDepth = table + 2;
  const list = !types ? [] : Array.isArray(types) ? types as readonly NodeType[] : [types as NodeType];
  if (list.length && cellDepth < $pos.depth) {
    const cell = $pos.node(cellDepth);
    const index = $pos.index(cellDepth) + 1;
    if (list.every((type) => cell.canReplaceWith(index, index, type))) return $pos.after(cellDepth + 1);
  }
  return $pos.after(table);
}

function contentTypes(schema: NodeType["schema"], content: JSONContent | JSONContent[]) {
  const nodes = Array.isArray(content) ? content : [content];
  return nodes.map((node) => schema.nodes[node.type ?? ""]).filter((type): type is NodeType => Boolean(type));
}

/**
 * Chain step that inserts block content at the selection like `insertContent`, but
 * never splits a table: inside a table the content goes where
 * `resolveBlockInsertPosition` allows it, leaving the selected cell text untouched.
 */
export function insertBlockContent(chain: ChainedCommands, content: JSONContent | JSONContent[]) {
  return chain.command(({ tr, commands }) => {
    if (!isInsideTable(tr.doc, tr.selection.from)) return commands.insertContent(content);
    const at = resolveBlockInsertPosition(tr.doc, tr.selection.from, contentTypes(tr.doc.type.schema, content));
    return commands.insertContentAt(at, content);
  });
}
