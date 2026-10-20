import { describe, expect, it } from "vitest";
import type { PresentationElement } from "./presentation";
import { applySelectChanges, contextMenuSelection, dragTargetId, drillSelectionTargetId, paneClickSelection, parentSelection, selectionPath, selectionTargetId, toggleSelection } from "./presentation-selection";
import { planPaste } from "./presentation-clipboard";

const frame = (id: string, x: number, y: number, width: number, height: number, extra: Partial<Extract<PresentationElement, { type: "frame" }>["content"]> = {}, parentId?: string): PresentationElement =>
  ({ id, type: "frame", parentId, x, y, width, height, rotation: 0, content: { label: id, shape: "rect", color: "", ...extra } });
const text = (id: string, x: number, y: number, parentId?: string): PresentationElement =>
  ({ id, type: "text", parentId, x, y, width: 100, height: 40, rotation: 0, content: { text: id, fontSize: 24, bold: false, color: "", align: "left" } });

const elements: PresentationElement[] = [
  frame("outer", 0, 0, 1000, 800),
  frame("inner", 100, 100, 300, 200, {}, "outer"),
  frame("group", 600, 500, 300, 200, { isGroup: true, shape: "none" }, "outer"),
  text("member", 620, 520, "group"),
  text("loose", 2000, 2000),
];

describe("presentation click selection", () => {
  it("resolves a group member to its group", () => {
    expect(selectionTargetId(elements, "member")).toBe("group");
    expect(selectionTargetId(elements, "loose")).toBe("loose");
  });
  it("toggles an id in and out of the selection", () => {
    expect(toggleSelection(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleSelection(["a", "b"], "a")).toEqual(["b"]);
  });
  it("clears on an empty-canvas click, even inside a frame, and keeps the selection with a modifier", () => {
    expect(paneClickSelection(["loose"], false)).toEqual([]);
    const current = ["inner"];
    expect(paneClickSelection(current, true)).toBe(current);
  });
});

describe("presentation group drill-in", () => {
  const nested: PresentationElement[] = [
    ...elements,
    frame("subgroup", 700, 560, 150, 100, { isGroup: true, shape: "none" }, "group"),
    text("deep", 710, 570, "subgroup"),
  ];
  it("lists the selectable levels outermost first, skipping section frames", () => {
    expect(selectionPath(nested, "deep")).toEqual(["group", "subgroup", "deep"]);
    expect(selectionPath(nested, "inner")).toEqual(["inner"]);
  });
  it("drills one level in when the group around the click is selected", () => {
    expect(drillSelectionTargetId(nested, "deep", [])).toBe("group");
    expect(drillSelectionTargetId(nested, "deep", ["group"])).toBe("subgroup");
    expect(drillSelectionTargetId(nested, "deep", ["subgroup"])).toBe("deep");
    expect(drillSelectionTargetId(nested, "deep", ["deep"])).toBe("deep");
  });
  it("selects siblings directly while working inside a group", () => {
    expect(selectionTargetId(nested, "member", ["subgroup"])).toBe("member");
    expect(selectionTargetId(nested, "member", ["loose"])).toBe("group");
    expect(applySelectChanges(nested, ["subgroup"], [{ id: "subgroup", selected: false }, { id: "member", selected: true }])).toEqual(["member"]);
  });
  it("drags the nearest selected level", () => {
    expect(dragTargetId(nested, "deep", new Set())).toBe("group");
    expect(dragTargetId(nested, "deep", new Set(["subgroup"]))).toBe("subgroup");
    expect(dragTargetId(nested, "deep", new Set(["deep", "group"]))).toBe("deep");
  });
  it("steps out one level on Escape and clears at the top", () => {
    expect(parentSelection(nested, ["deep"])).toEqual(["subgroup"]);
    expect(parentSelection(nested, ["subgroup"])).toEqual(["group"]);
    expect(parentSelection(nested, ["group"])).toEqual([]);
    expect(parentSelection(nested, [])).toEqual([]);
  });
});

describe("presentation context-menu selection", () => {
  it("keeps the selection inside its bounds and otherwise acts like a plain click", () => {
    const current = ["group"];
    expect(contextMenuSelection(elements, current, { x: 601, y: 501 })).toBe(current);
    expect(contextMenuSelection(elements, current, { x: 150, y: 150 })).toEqual([]);
    expect(contextMenuSelection(elements, current, { x: 5000, y: 5000 })).toEqual([]);
  });
});

describe("presentation select changes", () => {
  it("selects the group for a member and deselects it through the member", () => {
    expect(applySelectChanges(elements, [], [{ id: "member", selected: true }])).toEqual(["group"]);
    expect(applySelectChanges(elements, ["group", "loose"], [{ id: "member", selected: false }])).toEqual(["loose"]);
  });
  it("does not drop an id that is selected in the same batch, whatever the order", () => {
    expect(applySelectChanges(elements, ["group"], [{ id: "member", selected: true }, { id: "group", selected: false }])).toEqual(["group"]);
    expect(applySelectChanges(elements, ["group"], [{ id: "group", selected: false }, { id: "member", selected: true }])).toEqual(["group"]);
  });
  it("keeps a multi-selection when a member of a selected group is pressed", () => {
    const current = ["group", "loose"];
    expect(applySelectChanges(elements, current, [{ id: "member", selected: true }, { id: "loose", selected: false }])).toBe(current);
  });
  it("keeps preserved ids and returns the same array when nothing changes", () => {
    const current = ["loose"];
    expect(applySelectChanges(elements, current, [{ id: "loose", selected: false }], ["loose"])).toBe(current);
    expect(applySelectChanges(elements, current, [{ id: "loose", selected: true }])).toBe(current);
  });
});

describe("presentation paste placement", () => {
  const copied = [text("a", 100, 100)];
  it("pastes at the target, and moves on 12/12 (PowerPoint) for each repeat of the same copy", () => {
    const first = planPaste(copied, { source: "copy-1", target: "centre", point: { x: 500, y: 400 } }, null);
    expect(first.center).toEqual({ x: 500, y: 400 });
    const second = planPaste(copied, { source: "copy-1", target: "centre", point: { x: 500, y: 400 } }, first);
    const third = planPaste(copied, { source: "copy-1", target: "centre", point: { x: 500, y: 400 } }, second);
    expect(second.center).toEqual({ x: 512, y: 412 });
    expect(third.center).toEqual({ x: 524, y: 424 });
  });
  it("starts over for a new copy or a new target", () => {
    const first = planPaste(copied, { source: "copy-1", target: "centre", point: { x: 500, y: 400 } }, null);
    expect(planPaste(copied, { source: "copy-2", target: "centre", point: { x: 500, y: 400 } }, first).center).toEqual({ x: 500, y: 400 });
    expect(planPaste(copied, { source: "copy-1", target: "10,10", point: { x: 10, y: 10 } }, first).center).toEqual({ x: 10, y: 10 });
  });
  it("never lands exactly on the copied original", () => {
    expect(planPaste(copied, { source: "copy-1", target: "10,10", point: { x: 150, y: 120 } }, null).center).toEqual({ x: 162, y: 132 });
  });
});
