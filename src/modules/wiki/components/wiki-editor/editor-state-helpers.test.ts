import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { Mapping, StepMap } from "@tiptap/pm/transform";
import { clampRange, mapRange } from "./yjs-anchor";
import { PendingLinkRange, pendingLinkKey, pendingLinkRange } from "./link-selection";
import { CAN_REDO, CAN_UNDO, historyFlags } from "./use-history-availability";
import { calculateWritingStats, sameWritingStats } from "../../lib/editor-writing";

const schema = new Schema({ nodes: { doc: { content: "paragraph+" }, paragraph: { content: "text*", toDOM: () => ["p", 0] }, text: {} } });

function state(text: string) {
  const plugins = PendingLinkRange.config.addProseMirrorPlugins!.call({} as never);
  return EditorState.create({ schema, doc: schema.node("doc", null, [schema.node("paragraph", null, text ? [schema.text(text)] : [])]), plugins });
}

describe("mapRange", () => {
  it("keeps text typed at either edge outside the range", () => {
    // "Alpha wonderful omega": "wonderful" is 7..16.
    const insertBefore = new Mapping([new StepMap([7, 0, 3])]);
    expect(mapRange({ from: 7, to: 16 }, insertBefore)).toEqual({ from: 10, to: 19 });
    const insertAfter = new Mapping([new StepMap([16, 0, 3])]);
    expect(mapRange({ from: 7, to: 16 }, insertAfter)).toEqual({ from: 7, to: 16 });
  });

  it("collapses instead of inverting when the range is deleted", () => {
    const deleteAll = new Mapping([new StepMap([5, 15, 0])]);
    const mapped = mapRange({ from: 7, to: 16 }, deleteAll);
    expect(mapped.from).toBeLessThanOrEqual(mapped.to);
  });
});

describe("clampRange", () => {
  it("orders and bounds the range to the document", () => {
    expect(clampRange({ from: 30, to: 4 }, 20)).toEqual({ from: 4, to: 20 });
    expect(clampRange({ from: -3, to: 2 }, 20)).toEqual({ from: 0, to: 2 });
  });
});

describe("pending link range", () => {
  it("stores, maps and clears the range and decorates it", () => {
    let current = state("Alpha wonderful omega");
    current = current.apply(current.tr.setMeta(pendingLinkKey, { set: { from: 7, to: 16 } }));
    expect(pendingLinkRange(current)).toEqual({ from: 7, to: 16 });
    // Focus moving away collapses the selection; the pending range stays.
    current = current.apply(current.tr.setSelection(TextSelection.create(current.doc, 1)));
    expect(pendingLinkRange(current)).toEqual({ from: 7, to: 16 });
    // An edit before the word shifts it.
    current = current.apply(current.tr.insertText("Hey ", 1));
    expect(pendingLinkRange(current)).toEqual({ from: 11, to: 20 });
    expect(current.doc.textBetween(11, 20)).toBe("wonderful");
    const plugin = current.plugins.find((candidate) => candidate.spec.key === pendingLinkKey)!;
    const decorations = plugin.props.decorations!.call(plugin, current) as unknown as { find(): Array<{ from: number; to: number }> };
    expect(decorations.find().map(({ from, to }) => ({ from, to }))).toEqual([{ from: 11, to: 20 }]);
    current = current.apply(current.tr.setMeta(pendingLinkKey, { clear: true }));
    expect(pendingLinkRange(current)).toBeNull();
  });
});

describe("historyFlags", () => {
  it("encodes whether undo and redo are available", () => {
    expect(historyFlags(null)).toBe(0);
    expect(historyFlags({ undoStack: [], redoStack: [] })).toBe(0);
    expect(historyFlags({ undoStack: [1], redoStack: [] })).toBe(CAN_UNDO);
    expect(historyFlags({ undoStack: [1], redoStack: [1] })).toBe(CAN_UNDO | CAN_REDO);
  });
});

describe("writing stats", () => {
  it("counts a large document and compares by value", () => {
    const text = Array.from({ length: 8800 }, (_, index) => `wort${index}`).join(" ");
    const stats = calculateWritingStats(state(text).doc);
    expect(stats.words).toBe(8800);
    expect(sameWritingStats(stats, { ...stats })).toBe(true);
    expect(sameWritingStats(stats, { ...stats, words: 1 })).toBe(false);
  });
});
