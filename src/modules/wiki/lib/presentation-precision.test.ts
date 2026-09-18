import { describe, expect, it } from "vitest";
import { alignPresentationToFrame, containingPresentationFrame, setPreciseGeometry } from "./presentation-precision";
import { initialPresentationCanvasState, normalizeRotation, presentationCanvasReducer, presentationElementsSchema, type PresentationElement } from "./presentation";

const frame: PresentationElement = { id: "frame", type: "frame", x: 0, y: 0, width: 1000, height: 600, rotation: 0, content: { label: "Slide", color: "", shape: "rect" } };
const shape: PresentationElement = { id: "a", parentId: "frame", type: "shape", x: 100, y: 100, width: 200, height: 100, rotation: 0, content: { shape: "rect", fill: "", stroke: "", strokeWidth: 1, opacity: 1 } };
const group: PresentationElement = { ...frame, id: "group", parentId: "frame", x: 100, y: 100, width: 400, height: 200, content: { ...frame.content, isGroup: true } };

describe("precise presentation geometry", () => {
  it("stores fractional positions, dimensions and rotations without snapping", () => {
    let elements: PresentationElement[] = [frame, shape];
    for (const [field, value] of [["x", 100.125], ["width", 200.001], ["x", -10.25], ["y", 42.125], ["width", 222.5], ["rotation", 12.75]] as const) {
      elements = setPreciseGeometry(elements, "a", field, value, false);
      expect(elements[1][field]).toBe(value);
    }
    expect(normalizeRotation(372.75)).toBe(12.75);
    expect(normalizeRotation(-372.75)).toBe(-12.75);
    expect(presentationElementsSchema.safeParse(elements).success).toBe(true);
  });
  it("preserves proportions and rejects invalid complete-tree changes", () => {
    const elements = [frame, group, { ...shape, parentId: "group", width: 40, height: 20 }];
    const resized = setPreciseGeometry(elements, "group", "width", 800, true);
    expect(resized[1]).toMatchObject({ width: 800, height: 400, x: 100, y: 100 });
    expect(resized[2]).toMatchObject({ width: 80, height: 40 });
    expect(setPreciseGeometry(elements, "group", "width", 200, true)).toBe(elements);
    for (const value of [NaN, Infinity, -1, 0, 19, 20_001]) expect(setPreciseGeometry(elements, "a", "width", value, false)).toBe(elements);
    expect(setPreciseGeometry([frame, shape], "a", "height", 20_000, true)).toEqual([frame, shape]);
  });
  it("moves a section's children but resizes only the section border", () => {
    const elements = [frame, shape];
    expect(setPreciseGeometry(elements, "frame", "x", 50.25, false)[1].x).toBe(150.25);
    expect(setPreciseGeometry(elements, "frame", "width", 1200, false)[1]).toBe(shape);
  });
  it("honors ancestor locks and attached connectors", () => {
    const elements: PresentationElement[] = [{ ...frame, locked: true }, shape];
    expect(setPreciseGeometry(elements, "a", "x", 1, false)).toBe(elements);
    const connected: PresentationElement[] = [frame, shape, { ...shape, id: "line", content: { ...shape.content, shape: "arrow", connection: { fromId: "frame", toId: "a" } } }];
    expect(setPreciseGeometry(connected, "line", "rotation", 22.5, false)).toBe(connected);
  });
  it("rotates all descendants by the same fractional angle and reverses it without drift", () => {
    const elements = [frame, group, { ...shape, parentId: "group", rotation: 7.25 }];
    const rotated = setPreciseGeometry(elements, "group", "rotation", 22.5, false);
    expect(rotated[2].rotation).toBe(29.75);
    const restored = setPreciseGeometry(rotated, "group", "rotation", 0, false);
    expect(restored[2].x).toBeCloseTo(shape.x, 8);
    expect(restored[2].y).toBeCloseTo(shape.y, 8);
    expect(restored[2].rotation).toBe(7.25);
  });
  it("makes separate property commits undoable and redoable", () => {
    let state = initialPresentationCanvasState([frame, shape], []);
    for (const value of [120.25, 150.5]) state = presentationCanvasReducer(state, { type: "edit", at: 10, separate: true, elements: current => setPreciseGeometry(current, "a", "x", value, false) });
    state = presentationCanvasReducer(state, { type: "undo" }); expect(state.elements[1].x).toBe(120.25);
    state = presentationCanvasReducer(state, { type: "undo" }); expect(state.elements[1].x).toBe(100);
    state = presentationCanvasReducer(state, { type: "redo" }); expect(state.elements[1].x).toBe(120.25);
  });
});

describe("align within frame", () => {
  it("aligns one object to each edge or center", () => {
    const expected = { left: [0, 100], center: [400, 100], right: [800, 100], top: [100, 0], middle: [100, 250], bottom: [100, 500] };
    for (const mode of ["left", "center", "right", "top", "middle", "bottom"] as const) {
      const result = alignPresentationToFrame([frame, shape], new Set(["a"]), mode);
      expect([result[1].x, result[1].y]).toEqual(expected[mode]);
      expect(result[0]).toBe(frame);
    }
  });
  it("uses visible object bounds and the frame's rotated axes", () => {
    const elements = [{ ...frame, rotation: 90 }, { ...shape, rotation: 90 }];
    const result = alignPresentationToFrame(elements, new Set(["a"]), "left");
    expect(result[1].y).toBeCloseTo(-150);
    expect(result[1].x).toBeCloseTo(100);
    const turned = alignPresentationToFrame([frame, { ...shape, rotation: 90 }], new Set(["a"]), "left");
    expect(turned[1].x).toBeCloseTo(-50);
  });
  it("selects the shared section and translates grouped descendants exactly once", () => {
    const elements = [frame, group, { ...shape, parentId: "group" }];
    const ids = new Set(["group", "a"]);
    expect(containingPresentationFrame(elements, ids)?.id).toBe("frame");
    const aligned = alignPresentationToFrame(elements, ids, "right");
    expect(aligned[1].x).toBe(600); expect(aligned[2].x).toBe(600);
    expect(alignPresentationToFrame(aligned, ids, "right")).toBe(aligned);
  });
  it("leaves selections without a common frame, locked roots and distribution unchanged", () => {
    const elements = [frame, { ...shape, parentId: undefined }];
    expect(alignPresentationToFrame(elements, new Set(["a"]), "left")).toBe(elements);
    const locked = [{ ...frame, locked: true }, shape];
    expect(alignPresentationToFrame(locked, new Set(["a"]), "left")).toBe(locked);
    expect(alignPresentationToFrame([frame, shape], new Set(["a"]), "horizontal")).toEqual([frame, shape]);
  });
});
