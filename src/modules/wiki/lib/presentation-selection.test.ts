import { describe, expect, it } from "vitest";
import type { PresentationElement } from "./presentation";
import { applySelectChanges, contextMenuSelection, paneClickSelection, selectionTargetId, toggleSelection } from "./presentation-selection";
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
  it("hit-tests the smallest section frame under an empty-canvas click", () => {
    expect(paneClickSelection(elements, ["loose"], { x: 150, y: 150 }, false)).toEqual(["inner"]);
    expect(paneClickSelection(elements, ["loose"], { x: 500, y: 50 }, false)).toEqual(["outer"]);
    expect(paneClickSelection(elements, ["loose"], { x: 150, y: 150 }, true)).toEqual(["loose", "inner"]);
    expect(paneClickSelection(elements, ["loose", "inner"], { x: 150, y: 150 }, true)).toEqual(["loose"]);
  });
  it("clears on a plain click outside every frame and keeps the selection with a modifier", () => {
    expect(paneClickSelection(elements, ["inner"], { x: 5000, y: 5000 }, false)).toEqual([]);
    const current = ["inner"];
    expect(paneClickSelection(elements, current, { x: 5000, y: 5000 }, true)).toBe(current);
  });
  it("never hit-tests groups, which have no interior of their own", () => {
    expect(paneClickSelection(elements, [], { x: 890, y: 690 }, false)).toEqual(["outer"]);
  });
});

describe("presentation context-menu selection", () => {
  it("keeps the selection inside its bounds and otherwise acts like a plain click", () => {
    const current = ["group"];
    expect(contextMenuSelection(elements, current, { x: 601, y: 501 })).toBe(current);
    expect(contextMenuSelection(elements, current, { x: 150, y: 150 })).toEqual(["inner"]);
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
  it("keeps preserved ids and returns the same array when nothing changes", () => {
    const current = ["loose"];
    expect(applySelectChanges(elements, current, [{ id: "loose", selected: false }], ["loose"])).toBe(current);
    expect(applySelectChanges(elements, current, [{ id: "loose", selected: true }])).toBe(current);
  });
});

describe("presentation paste placement", () => {
  const copied = [text("a", 100, 100)];
  it("pastes at the target, and moves on 24/24 for each repeat of the same copy", () => {
    const first = planPaste(copied, { source: "copy-1", target: "centre", point: { x: 500, y: 400 } }, null);
    expect(first.center).toEqual({ x: 500, y: 400 });
    const second = planPaste(copied, { source: "copy-1", target: "centre", point: { x: 500, y: 400 } }, first);
    const third = planPaste(copied, { source: "copy-1", target: "centre", point: { x: 500, y: 400 } }, second);
    expect(second.center).toEqual({ x: 524, y: 424 });
    expect(third.center).toEqual({ x: 548, y: 448 });
  });
  it("starts over for a new copy or a new target", () => {
    const first = planPaste(copied, { source: "copy-1", target: "centre", point: { x: 500, y: 400 } }, null);
    expect(planPaste(copied, { source: "copy-2", target: "centre", point: { x: 500, y: 400 } }, first).center).toEqual({ x: 500, y: 400 });
    expect(planPaste(copied, { source: "copy-1", target: "10,10", point: { x: 10, y: 10 } }, first).center).toEqual({ x: 10, y: 10 });
  });
  it("never lands exactly on the copied original", () => {
    expect(planPaste(copied, { source: "copy-1", target: "10,10", point: { x: 150, y: 120 } }, null).center).toEqual({ x: 174, y: 144 });
  });
});
