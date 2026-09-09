import { describe, expect, it } from "vitest";
import { arrangePresentation, fitPresentationText, maintainPresentationLayout, presentationTextFits } from "./presentation-layout";
import { applyGeometryChanges, duplicatePresentationTree, initialPresentationCanvasState, presentationCanvasReducer, presentationElementsSchema, type PresentationElement, type PresentationTextElement } from "./presentation";
const frame = (id: string, x: number, width = 100): PresentationElement => ({ id, type: "frame", x, y: 0, width, height: 100, rotation: 0, content: { label: id, shape: "rect", color: "" } });
const text: PresentationTextElement = { id: "text", type: "text", x: 10, y: 10, width: 200, height: 70, rotation: 0, content: { text: "A heading with several words", fontSize: 40, bold: false, color: "", align: "left", autoFit: { minFontSize: 12, maxFontSize: 40 } } };
const connector: PresentationElement = { id: "line", type: "shape", x: 0, y: 0, width: 20, height: 20, rotation: 0, content: { shape: "arrow", fill: "", stroke: "", strokeWidth: 3, opacity: 1, connection: { fromId: "a", toId: "b" } } };
describe("presentation arrangement", () => {
  it("moves descendants once when both parent and child are selected", () => {
    const child = { ...text, parentId: "b", x: 310 };
    const result = arrangePresentation([frame("a", 0), frame("b", 300), child], new Set(["a", "b", "text"]), "left");
    expect(result.find(e => e.id === "b")?.x).toBe(0);
    expect(result.find(e => e.id === "text")?.x).toBe(10);
  });
  it("distributes edge gaps, not centers, for different object widths", () => {
    const result = arrangePresentation([frame("a", 0, 100), frame("b", 160, 200), frame("c", 600, 100)], new Set(["a", "b", "c"]), "horizontal");
    expect(result.map(e => e.x)).toEqual([0, 250, 600]);
  });
  it("refuses locked selection roots and impossible non-overlapping distribution", () => {
    const locked = [frame("a", 0), { ...frame("b", 300), locked: true }];
    expect(arrangePresentation(locked, new Set(["a", "b"]), "left")).toBe(locked);
    const overlap = [frame("a", 0), frame("b", 5), frame("c", 10)];
    expect(arrangePresentation(overlap, new Set(["a", "b", "c"]), "horizontal")).toBe(overlap);
  });
});
describe("automatic text fitting", () => {
  it("shrinks long text and restores the requested size when space is available", () => {
    const fitted = fitPresentationText(text);
    expect(fitted.content.fontSize).toBeLessThan(40);
    expect(presentationTextFits(fitted)).toBe(true);
    expect(fitPresentationText({ ...fitted, width: 1200, height: 200 }).content.fontSize).toBe(40);
  });
  it("respects padding, rich text, explicit line breaks, and the readable minimum", () => {
    const crowded = fitPresentationText({ ...text, width: 100, height: 30, content: { ...text.content, padding: 10, runs: [{ text: "Long text\n".repeat(30), bold: true }] } });
    expect(crowded.content.fontSize).toBe(12);
    expect(presentationTextFits(crowded)).toBe(false);
    expect(text.content.fontSize).toBe(40);
  });
});
describe("attached connectors", () => {
  it("does not snap a moving endpoint back onto its own connector", () => {
    const elements = maintainPresentationLayout([frame("a", 0), frame("b", 300), connector]);
    expect(applyGeometryChanges(elements, [{ id: "a", x: 2 }], 8).elements[0].x).toBe(2);
  });
  it("tracks section movement and resize in the same undo step", () => {
    const elements = maintainPresentationLayout([frame("a", 0), frame("b", 300), connector]);
    expect(elements[2]).toMatchObject({ x: 100, y: 40, width: 200 });
    let state = initialPresentationCanvasState(elements, []);
    state = presentationCanvasReducer(state, { type: "geometry", at: 1, changes: [{ id: "b", x: 500, width: 200 }], tolerance: 0, gesture: false });
    expect(state.elements[2]).toMatchObject({ x: 100, y: 40, width: 400 });
    const restored = presentationCanvasReducer(state, { type: "undo" });
    expect(restored.elements).toEqual(elements);
    expect(() => presentationElementsSchema.parse(state.elements)).not.toThrow();
  });
  it("detaches a connector when an endpoint is removed", () => {
    const result = maintainPresentationLayout([frame("a", 0), connector]);
    expect(result[1].type === "shape" && result[1].content.connection).toBeUndefined();
  });
  it("remaps copied endpoint IDs when duplicating a connected selection", () => {
    const elements = maintainPresentationLayout([frame("a", 0), frame("b", 300), connector]);
    const result = duplicatePresentationTree(elements, new Set(["a", "b", "line"]), new Map([["a", "a2"], ["b", "b2"], ["line", "line2"]]));
    expect(result.find(e => e.id === "line2")).toMatchObject({ content: { connection: { fromId: "a2", toId: "b2" } } });
  });
  it("supports rotated endpoints and remains stable when objects overlap", () => {
    for (const x of [0, 50, 300]) {
      const result = maintainPresentationLayout([{ ...frame("a", 0), rotation: 45 }, frame("b", x), connector]);
      expect(() => presentationElementsSchema.parse(result)).not.toThrow();
      expect(maintainPresentationLayout(result)).toBe(result);
    }
  });
});
