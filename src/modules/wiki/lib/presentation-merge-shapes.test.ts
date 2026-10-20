import { describe, expect, it } from "vitest";
import { presentationElementSchema, type PresentationElement } from "./presentation-model";
import { area, mergeShapes, shapeRegion } from "./presentation-merge-shapes";
import { presetShapeNames } from "./preset-shapes/preset-geometry";

type Shape = Extract<PresentationElement, { type: "shape" }>;
const rect = (id: string, x: number, y: number, width: number, height: number, extra: Partial<Shape["content"]> = {}, rotation = 0): Shape => ({
  id, type: "shape", x, y, width, height, rotation,
  content: { shape: "rect", preset: "rect", fill: id === "a" ? "#ff0000" : "#0000ff", stroke: "#000", strokeWidth: 2, opacity: 1, text: id, ...extra },
});
let counter = 0;
const createId = () => `new${++counter}`;
// a: 0..100 × 0..100, b: 50..150 × 50..150 — overlap 50 × 50.
const a = rect("a", 0, 0, 100, 100), b = rect("b", 50, 50, 100, 100);
const other: PresentationElement = { id: "t", type: "text", x: 0, y: 0, width: 50, height: 20, rotation: 0, content: { text: "", fontSize: 18, bold: false, color: "", align: "left" } } as PresentationElement;
const regionArea = (element: PresentationElement) => area(shapeRegion(element)!);

describe("merge shapes", () => {
  it("unions two overlapping rectangles into one freeform with the primary's format", () => {
    const result = mergeShapes([other, a, b], ["a", "b"], "union", createId)!;
    expect(result.created).toHaveLength(1);
    expect(result.elements.map((e) => e.id)).toEqual(["t", result.created[0]]);
    const merged = result.elements[1] as Shape;
    expect(regionArea(merged)).toBeCloseTo(17_500, 0);
    expect(merged).toMatchObject({ x: 0, y: 0, width: 150, height: 150, rotation: 0 });
    expect(merged.content).toMatchObject({ fill: "#ff0000", text: "a", shape: "rect" });
    expect(merged.content.preset).toBeUndefined();
    expect(merged.content.freeform?.closed).toBe(true);
  });
  it("takes the primary from the selection order, not the stacking order", () => {
    const result = mergeShapes([a, b, other], ["b", "a"], "union", createId)!;
    const merged = result.elements.find((e) => e.id === result.created[0]) as Shape;
    expect(merged.content.fill).toBe("#0000ff");
    expect(result.elements.map((e) => e.id)).toEqual([result.created[0], "t"]);
  });
  it("intersects, subtracts and combines", () => {
    const intersect = mergeShapes([a, b], ["a", "b"], "intersect", createId)!.elements[0];
    expect(regionArea(intersect)).toBeCloseTo(2_500, 0);
    expect(intersect).toMatchObject({ x: 50, y: 50, width: 50, height: 50 });
    const subtract = mergeShapes([a, b], ["a", "b"], "subtract", createId)!.elements[0];
    expect(regionArea(subtract)).toBeCloseTo(7_500, 0);
    const combine = mergeShapes([a, b], ["a", "b"], "combine", createId)!.elements[0] as Shape;
    expect(regionArea(combine)).toBeCloseTo(15_000, 0);
    expect(combine.content.freeform!.d.match(/M/g)).toHaveLength(2);
  });
  it("fragments two overlapping rectangles into three pieces", () => {
    const result = mergeShapes([a, b], ["a", "b"], "fragment", createId)!;
    expect(result.created).toHaveLength(3);
    for (const element of result.elements) expect(presentationElementSchema.safeParse(element).success).toBe(true);
    const areas = result.elements.map(regionArea).sort((x, y) => x - y);
    expect(areas[0]).toBeCloseTo(2_500, 0);
    expect(areas[1]).toBeCloseTo(7_500, 0);
    expect(areas[2]).toBeCloseTo(7_500, 0);
  });
  it("cuts a hole that the nonzero renderer leaves open", () => {
    const outer = rect("a", 0, 0, 100, 100), inner = rect("b", 25, 25, 50, 50);
    const merged = mergeShapes([outer, inner], ["a", "b"], "subtract", createId)!.elements[0] as Shape;
    expect(regionArea(merged)).toBeCloseTo(7_500, 0);
    // Opposite winding: the signed areas of the two rings have opposite signs.
    const rings = merged.content.freeform!.d.split("M").filter(Boolean).map((ring) => ring.replace("Z", "").split("L").map((p) => p.trim().split(/\s+/).map(Number)));
    const signed = rings.map((ring) => ring.reduce((sum, [x1, y1], i) => { const [x2, y2] = ring[(i + 1) % ring.length]; return sum + x1 * y2 - x2 * y1; }, 0));
    expect(Math.sign(signed[0])).toBe(-Math.sign(signed[1]));
  });
  it("handles rotation, ellipses and presets with curves", () => {
    const rotated = rect("a", 0, 0, 100, 100, {}, 45);
    expect(regionArea(rotated)).toBeCloseTo(10_000, 0);
    const ellipse = rect("b", 0, 0, 100, 100, { preset: undefined, shape: "ellipse" });
    // Flattened within 0.25 pt of the curve: at most the perimeter × 0.25 smaller.
    expect(Math.PI * 2_500 - regionArea(ellipse)).toBeGreaterThanOrEqual(0);
    expect(Math.PI * 2_500 - regionArea(ellipse)).toBeLessThan(Math.PI * 100 * 0.25);
    const union = mergeShapes([rotated, { ...ellipse, x: 60 }], ["a", "b"], "union", createId)!.elements[0];
    expect(regionArea(union)).toBeGreaterThan(10_000);
  });
  it("returns null for too few mergeable shapes or an empty result", () => {
    const line = rect("b", 0, 0, 100, 20, { preset: undefined, shape: "line" });
    expect(mergeShapes([a, line], ["a", "b"], "union", createId)).toBeNull();
    expect(mergeShapes([a], ["a"], "union", createId)).toBeNull();
    const apart = rect("b", 300, 300, 50, 50);
    expect(mergeShapes([a, apart], ["a", "b"], "intersect", createId)).toBeNull();
    expect(mergeShapes([a, apart], ["a", "b"], "union", createId)!.created).toHaveLength(1);
  });
  it("finds a region for every filled preset without failing", () => {
    let filled = 0;
    for (const name of presetShapeNames) {
      const region = shapeRegion(rect("a", 10, 20, 120, 80, { preset: name as Shape["content"]["preset"] }, 15));
      if (region) { filled++; expect(area(region), name).toBeGreaterThan(0); }
    }
    expect(filled).toBeGreaterThan(150);
  });
});
