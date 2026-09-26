import { describe, expect, it } from "vitest";
import { assignFrameMembership, frameAtPoint, initialPresentationCanvasState, presentationCanvasReducer, type PresentationElement } from "./presentation";
import { frameAtPoint as interactionFrameAtPoint } from "./presentation-interactions";
import { adoptInsertedElements, appendFrameStops, clearFramePlacement, framePresetHeight, nextFrameNumber, presentationRemovalSet, removePresentationElements } from "./presentation-frames";

const frame = (id: string, x: number, y: number, width: number, height: number, extra: Partial<PresentationElement> = {}, isGroup = false): PresentationElement =>
  ({ id, type: "frame", x, y, width, height, rotation: 0, content: { label: "", shape: "rect", color: "", ...(isGroup ? { isGroup } : {}) }, ...extra } as PresentationElement);
const text = (id: string, x: number, y: number, extra: Partial<PresentationElement> = {}): PresentationElement =>
  ({ id, type: "text", x, y, width: 100, height: 40, rotation: 0, content: { text: id, fontSize: 32, bold: false, color: "", align: "left" }, ...extra } as PresentationElement);
const parentOf = (elements: PresentationElement[], id: string) => elements.find((element) => element.id === id)?.parentId;
const name = (number: number) => `Rahmen ${number}`;

describe("frameAtPoint", () => {
  const elements = [frame("big", 0, 0, 1000, 800), frame("small", 100, 100, 300, 200), frame("group", 0, 0, 50, 50, {}, true), text("t", 150, 150, { parentId: "small" })];
  it("picks the smallest section frame containing the point and ignores groups", () => {
    expect(frameAtPoint(elements, { x: 200, y: 200 })?.id).toBe("small");
    expect(frameAtPoint(elements, { x: 900, y: 700 })?.id).toBe("big");
    expect(frameAtPoint(elements, { x: 10, y: 10 })?.id).toBe("big");
    expect(frameAtPoint(elements, { x: 2000, y: 10 })).toBeNull();
  });
  it("excludes the given ids with everything inside them and too-small frames", () => {
    expect(frameAtPoint(elements, { x: 200, y: 200 }, { exclude: ["small"] })?.id).toBe("big");
    expect(frameAtPoint(elements, { x: 200, y: 200 }, { minArea: 300 * 200 })?.id).toBe("big");
    expect(interactionFrameAtPoint).toBe(frameAtPoint);
  });
});

describe("assignFrameMembership", () => {
  it("joins the frame under the centre, switches frames and releases outside", () => {
    let elements = [frame("a", 0, 0, 500, 400), frame("b", 600, 0, 500, 400), text("t", 100, 100)];
    elements = assignFrameMembership(elements, ["t"]);
    expect(parentOf(elements, "t")).toBe("a");
    elements = assignFrameMembership(elements.map((e) => e.id === "t" ? { ...e, x: 700 } : e), ["t"]);
    expect(parentOf(elements, "t")).toBe("b");
    elements = assignFrameMembership(elements.map((e) => e.id === "t" ? { ...e, x: 2000 } : e), ["t"]);
    expect(elements.find((e) => e.id === "t")).not.toHaveProperty("parentId");
  });
  it("returns the same array when nothing changes", () => {
    const elements = [frame("a", 0, 0, 500, 400), text("t", 100, 100, { parentId: "a" })];
    expect(assignFrameMembership(elements, ["t"])).toBe(elements);
  });
  it("nests frames only inside larger frames and never inside themselves", () => {
    const elements = [frame("outer", 0, 0, 2000, 1000), frame("inner", 100, 100, 400, 300), frame("same", 1000, 100, 2000, 1000)];
    const next = assignFrameMembership(elements, ["inner", "outer", "same"]);
    expect(parentOf(next, "inner")).toBe("outer");
    expect(parentOf(next, "outer")).toBeUndefined();
    expect(parentOf(next, "same")).toBeUndefined();
  });
  it("leaves group children, locked elements, connectors and wiki-linked frames alone", () => {
    const elements = [
      frame("a", 0, 0, 1000, 800), frame("g", 100, 100, 300, 200, {}, true), text("child", 120, 120, { parentId: "g" }),
      text("locked", 500, 500, { locked: true }),
      frame("linked", 50, 50, 200, 100, { source: { pageId: "p", sectionId: "s" } }),
      { id: "arrow", type: "shape", x: 10, y: 10, width: 20, height: 20, rotation: 0, content: { shape: "arrow", fill: "", stroke: "", strokeWidth: 3, opacity: 1, connection: { fromId: "child", toId: "locked" } } } as PresentationElement,
    ];
    expect(assignFrameMembership(elements, ["child", "locked", "linked", "arrow"])).toBe(elements);
  });
});

describe("frame insertion", () => {
  it("names unnamed frames with the next free number and adopts new roots", () => {
    const existing = [{ ...frame("f1", 0, 0, 960, 540), content: { label: "Rahmen 4", shape: "rect", color: "" } } as PresentationElement, { ...frame("x", 3000, 0, 100, 100), content: { label: "Rahmen", shape: "rect", color: "" } } as PresentationElement];
    expect(nextFrameNumber(existing, name)).toBe(5);
    const next = adoptInsertedElements([...existing, frame("n1", 2000, 0, 960, 540), frame("n2", 4000, 0, 960, 540), text("t", 100, 100)], ["n1", "n2", "t"], name);
    expect(next.filter((e) => e.type === "frame").map((e) => e.type === "frame" && e.content.label)).toEqual(["Rahmen 4", "Rahmen", "Rahmen 5", "Rahmen 6"]);
    expect(parentOf(next, "t")).toBe("f1");
  });
  it("keeps labels of copied frames and the pasted subtree's own hierarchy", () => {
    const copy = { ...frame("c", 0, 0, 960, 540), content: { label: "Intro", shape: "rect", color: "" } } as PresentationElement;
    const next = adoptInsertedElements([frame("host", -100, -100, 3000, 2000), copy, text("ct", 10, 10, { parentId: "c" })], ["c", "ct"], name);
    expect(next.find((e) => e.id === "c")).toMatchObject({ parentId: "host", content: { label: "Intro" } });
    expect(parentOf(next, "ct")).toBe("c");
  });
  it("appends a stop per new section frame but not for groups or other elements", () => {
    const ids = ["s1", "s2"];
    const steps = appendFrameStops([{ id: "old", elementId: "x" }], [frame("f", 0, 0, 10, 10), frame("g", 0, 0, 10, 10, {}, true), text("t", 0, 0), frame("h", 0, 0, 10, 10)], () => ids.shift()!);
    expect(steps).toEqual([{ id: "old", elementId: "x" }, { id: "s1", elementId: "f" }, { id: "s2", elementId: "h" }]);
  });
});

describe("frame deletion", () => {
  it("deletes only a section frame and releases its members to the frame's parent", () => {
    const elements = [frame("outer", 0, 0, 3000, 2000), frame("f", 100, 100, 960, 540, { parentId: "outer" }), text("t", 200, 200, { parentId: "f" }), frame("g", 300, 300, 200, 100, { parentId: "f" }, true), text("gt", 310, 310, { parentId: "g" })];
    const removed = presentationRemovalSet(elements, ["f"]);
    expect([...removed]).toEqual(["f"]);
    const next = removePresentationElements(elements, removed);
    expect(next.map((e) => e.id)).toEqual(["outer", "t", "g", "gt"]);
    expect(parentOf(next, "t")).toBe("outer");
    expect(parentOf(next, "g")).toBe("outer");
    expect(parentOf(next, "gt")).toBe("g");
  });
  it("still deletes a group with its contents", () => {
    const elements = [frame("g", 0, 0, 200, 100, {}, true), text("gt", 10, 10, { parentId: "g" })];
    expect(removePresentationElements(elements, presentationRemovalSet(elements, ["g"]))).toEqual([]);
  });
  it("releases members to the canvas when a top-level frame is deleted", () => {
    const elements = [frame("f", 0, 0, 960, 540), text("t", 10, 10, { parentId: "f" })];
    expect(removePresentationElements(elements, presentationRemovalSet(elements, ["f"]))).toEqual([text("t", 10, 10)]);
  });
});

describe("frame presets and placement", () => {
  it("keeps the width and derives the height", () => {
    expect(framePresetHeight(960, "16:9")).toBe(540);
    expect(framePresetHeight(960, "4:3")).toBe(720);
    expect(framePresetHeight(960, "1:1")).toBe(960);
  });
  it("places a frame that would overlap right of the last stop", () => {
    const elements = [frame("a", 0, 0, 960, 540), frame("b", 2000, 1000, 960, 540)];
    const box = { x: 100, y: 100, width: 960, height: 540 };
    expect(clearFramePlacement(elements, [{ id: "s", elementId: "b" }, { id: "gone", elementId: "missing" }], box)).toEqual({ x: 2000 + 960 + 96, y: 1000 });
    expect(clearFramePlacement(elements, [], box)).toEqual({ x: 960 + 96, y: 0 });
    expect(clearFramePlacement(elements, [], { ...box, x: 5000 })).toEqual({ x: 5000, y: 100 });
  });
  it("slides past frames still in the way", () => {
    const elements = [frame("a", 0, 0, 960, 540), frame("b", 1000, 0, 960, 540)];
    expect(clearFramePlacement(elements, [{ id: "s", elementId: "a" }], { x: 0, y: 0, width: 960, height: 540 })).toEqual({ x: 1960 + 96, y: 0 });
  });
});

describe("drop membership in the canvas reducer", () => {
  it("moves a frame with its members and joins a dropped element in the same undo step", () => {
    let state = initialPresentationCanvasState([frame("f", 0, 0, 960, 540), text("t", 100, 100)], []);
    state = presentationCanvasReducer(state, { type: "gesture-start" });
    state = presentationCanvasReducer(state, { type: "geometry", at: 1, tolerance: 0, gesture: true, changes: [{ id: "t", x: 150, y: 100 }] });
    state = presentationCanvasReducer(state, { type: "geometry", at: 2, tolerance: 0, gesture: false, changes: [{ id: "t", x: 200, y: 100 }], membership: ["t"] });
    state = presentationCanvasReducer(state, { type: "gesture-end" });
    expect(state.elements.find((e) => e.id === "t")).toMatchObject({ x: 200, parentId: "f" });
    state = presentationCanvasReducer(state, { type: "geometry", at: 5000, tolerance: 0, gesture: false, changes: [{ id: "f", x: 500, y: 0 }], membership: ["f"] });
    expect(state.elements.find((e) => e.id === "t")).toMatchObject({ x: 700, y: 100 });
    state = presentationCanvasReducer(state, { type: "undo" });
    expect(state.elements.find((e) => e.id === "t")).toMatchObject({ x: 200, parentId: "f" });
    state = presentationCanvasReducer(state, { type: "undo" });
    expect(state.elements.find((e) => e.id === "t")).toMatchObject({ x: 100 });
    expect(state.elements.find((e) => e.id === "t")).not.toHaveProperty("parentId");
  });
});
