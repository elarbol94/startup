import { describe, expect, it } from "vitest";
import { presentationElementSchema, type PresentationElement } from "./presentation-model";
import {
  addNodeOnSegment, closePath, cubicAt, deleteNode, fitFreeform, flattenPath, freeformPathModel, freeformTransform, moveHandle, moveNode,
  nearestNode, nearestSegmentPoint, openPath, openSegment, parsePath, pathBounds, segmentCubic, serializePath, setNodeType, setSegmentCurved,
  setSegmentStraight, toEditableFreeform, type PathModel,
} from "./presentation-path-edit";

type Shape = Extract<PresentationElement, { type: "shape" }>;
const shape = (content: Partial<Shape["content"]>, box: Partial<Shape> = {}): Shape => ({
  id: "s", type: "shape", x: 100, y: 50, width: 200, height: 100, rotation: 0,
  content: { shape: "rect", fill: "#f00", stroke: "", strokeWidth: 2, opacity: 1, ...content }, ...box,
});
const close = (a: { x: number; y: number }, b: { x: number; y: number }, digits = 3) => {
  expect(a.x).toBeCloseTo(b.x, digits); expect(a.y).toBeCloseTo(b.y, digits);
};
const square: PathModel = parsePath("M0 0 L100 0 L100 100 L0 100 Z");

describe("parsing and serialising paths", () => {
  it("round-trips straight and curved absolute paths", () => {
    expect(serializePath(square)).toBe("M0 0 L100 0 L100 100 L0 100 Z");
    const curve = "M0 0 C10 20 30 40 50 60 L70 80";
    expect(serializePath(parsePath(curve))).toBe(curve);
  });
  it("reads relative, H/V, implicit repeats and merges a closing vertex", () => {
    const model = parsePath("m10 10 h20 v20 l-20 0 10 -5 L10 10 z");
    expect(model.subpaths).toHaveLength(1);
    expect(model.subpaths[0].closed).toBe(true);
    expect(model.subpaths[0].nodes.map(({ x, y }) => [x, y])).toEqual([[10, 10], [30, 10], [30, 30], [10, 30], [20, 25]]);
  });
  it("turns S, Q, T into cubics with reflected controls", () => {
    const s = parsePath("M0 0 C0 10 10 10 10 0 S20 -10 20 0").subpaths[0].nodes;
    close(s[1].out!, { x: 10, y: -10 });
    const q = parsePath("M0 0 Q10 10 20 0 T40 0").subpaths[0].nodes;
    close(q[0].out!, { x: 20 / 3, y: 20 / 3 });
    close(q[1].out!, { x: 20 + 20 / 3, y: -20 / 3 });
  });
  it("turns arcs into cubics that stay on the circle", () => {
    const model = parsePath("M0 50 A50 50 0 0 1 100 50 A50 50 0 0 1 0 50 Z");
    for (const { points } of flattenPath(model, 0.05)) for (const p of points) expect(Math.hypot(p.x - 50, p.y - 50)).toBeCloseTo(50, 0);
    const bounds = pathBounds(model)!;
    expect(bounds.minY).toBeCloseTo(0, 1); expect(bounds.maxY).toBeCloseTo(100, 1);
  });
  it("keeps several subpaths and classifies vertices by their handles", () => {
    const model = parsePath("M0 0 L10 0 L10 10 Z M20 20 C20 10 40 10 40 20 C40 30 60 30 60 20");
    expect(model.subpaths.map((sub) => sub.closed)).toEqual([true, false]);
    expect(model.subpaths[1].nodes[1].type).toBe("smooth");
    expect(parsePath("M0 0 C0 10 10 10 10 0 C10 -20 20 -10 20 0").subpaths[0].nodes[1].type).toBe("straight");
    expect(square.subpaths[0].nodes[1].type).toBe("corner");
  });
});

describe("editing points", () => {
  it("moves a vertex with its handles", () => {
    const model = parsePath("M0 0 C0 10 10 10 10 0");
    const moved = moveNode(model, { subpath: 0, node: 1 }, { x: 20, y: 5 });
    close(moved.subpaths[0].nodes[1], { x: 20, y: 5 });
    close(moved.subpaths[0].nodes[1].in!, { x: 20, y: 15 });
    expect(model.subpaths[0].nodes[1].x).toBe(10);
  });
  it("moves handles by vertex type", () => {
    const base = parsePath("M0 0 C0 10 10 10 10 0 C10 -10 20 -10 20 0");
    const ref = { subpath: 0, node: 1 };
    const smooth = moveHandle(setNodeType(base, ref, "smooth"), ref, "out", { x: 10, y: -20 }).subpaths[0].nodes[1];
    close(smooth.in!, { x: 10, y: 20 });
    const straight = moveHandle(setNodeType(base, ref, "straight"), ref, "out", { x: 20, y: 0 }).subpaths[0].nodes[1];
    close(straight.in!, { x: 0, y: 0 });
    const corner = moveHandle(setNodeType(base, ref, "corner"), ref, "out", { x: 20, y: 0 }).subpaths[0].nodes[1];
    close(corner.in!, { x: 10, y: 10 });
  });
  it("makes a corner between lines smooth with collinear, equal handles", () => {
    const node = setNodeType(square, { subpath: 0, node: 1 }, "smooth").subpaths[0].nodes[1];
    const a = { x: node.in!.x - node.x, y: node.in!.y - node.y }, b = { x: node.out!.x - node.x, y: node.out!.y - node.y };
    expect(a.x * b.y - a.y * b.x).toBeCloseTo(0);
    expect(Math.hypot(a.x, a.y)).toBeCloseTo(Math.hypot(b.x, b.y));
  });
  it("adds a vertex on a line and on a curve without changing the curve", () => {
    const line = addNodeOnSegment(square, { subpath: 0, segment: 0 }, 0.25)!;
    close(line.model.subpaths[0].nodes[1], { x: 25, y: 0 });
    expect(line.node).toEqual({ subpath: 0, node: 1 });
    const curve = parsePath("M0 0 C0 50 100 50 100 0");
    const original = segmentCubic(curve.subpaths[0], 0);
    const split = addNodeOnSegment(curve, { subpath: 0, segment: 0 }, 0.3)!.model.subpaths[0];
    close(split.nodes[1], cubicAt(original, 0.3));
    close(cubicAt(segmentCubic(split, 0), 0.5), cubicAt(original, 0.15));
    close(cubicAt(segmentCubic(split, 1), 0.5), cubicAt(original, 0.65));
  });
  it("deletes vertices but never the last two of an open path", () => {
    const triangle = deleteNode(square, { subpath: 0, node: 2 })!;
    expect(serializePath(triangle)).toBe("M0 0 L100 0 L0 100 Z");
    expect(deleteNode(triangle, { subpath: 0, node: 0 })).toBeNull();
  });
  it("switches segments between straight and curved", () => {
    const curved = setSegmentCurved(square, { subpath: 0, segment: 0 });
    expect(serializePath(curved)).toMatch(/^M0 0 C33\.333 0 66\.667 0 100 0/);
    expect(serializePath(setSegmentStraight(curved, { subpath: 0, segment: 0 }))).toBe(serializePath(square));
  });
  it("opens a closed path at a vertex and closes it again", () => {
    const opened = openPath(square, { subpath: 0, node: 2 });
    expect(serializePath(opened)).toBe("M100 100 L0 100 L0 0 L100 0 L100 100");
    expect(serializePath(closePath(opened, 0))).toBe("M100 100 L0 100 L0 0 L100 0 Z");
  });
  it("opens a closed path by removing a segment", () => {
    expect(serializePath(openSegment(square, { subpath: 0, segment: 1 }))).toBe("M100 100 L0 100 L0 0 L100 0");
  });
  it("finds the nearest vertex and outline point", () => {
    expect(nearestNode(square, { x: 97, y: 2 }, 10)).toMatchObject({ subpath: 0, node: 1 });
    expect(nearestNode(square, { x: 50, y: 50 }, 10)).toBeNull();
    const hit = nearestSegmentPoint(square, { x: 103, y: 40 }, 10)!;
    expect(hit).toMatchObject({ subpath: 0, segment: 1 });
    expect(hit.t).toBeCloseTo(0.4, 3);
    close(hit.point, { x: 100, y: 40 });
  });
});

describe("freeform conversion and fitting", () => {
  it("converts presets and older kinds to freeforms in their own box", () => {
    const preset = toEditableFreeform(shape({ preset: "rect" }))!;
    expect(preset.content.freeform).toEqual({ d: "M0 0 L200 0 L200 100 L0 100 Z", w: 200, h: 100, closed: true });
    expect(preset.content.preset).toBeUndefined();
    expect(preset.content.fill).toBe("#f00");
    const ellipse = toEditableFreeform(shape({ shape: "ellipse" }))!;
    expect(pathBounds(freeformPathModel(ellipse)!)).toMatchObject({ minX: 0, maxX: 200 });
    expect(ellipse.content.freeform!.d).toMatch(/^M[^A-Za-z]*(?:[LCZ][^A-Za-z]*)*$/);
    expect(toEditableFreeform(shape({ shape: "line" }))).toBeNull();
    expect(toEditableFreeform(shape({ shape: "star" }))!.content.freeform!.closed).toBe(true);
  });
  it("grows the box when a vertex leaves it, keeping the drawing in place", () => {
    const element = toEditableFreeform(shape({ preset: "rect" }))!;
    const model = moveNode(freeformPathModel(element)!, { subpath: 0, node: 0 }, { x: -50, y: -20 });
    const fitted = fitFreeform(element, model);
    expect(fitted).toMatchObject({ x: 50, y: 30, width: 250, height: 120 });
    expect(presentationElementSchema.safeParse(fitted).success).toBe(true);
    const t = freeformTransform(fitted);
    close(t.toCanvas({ x: 250, y: 20 }), { x: 300, y: 50 });
  });
  it("keeps a rotated shape's untouched vertices where they were", () => {
    const element = { ...toEditableFreeform(shape({ preset: "rect" }))!, rotation: 30 };
    const before = freeformTransform(element);
    const model = moveNode(freeformPathModel(element)!, { subpath: 0, node: 2 }, { x: 260, y: 140 });
    const fitted = fitFreeform(element, model);
    const after = freeformTransform(fitted), fittedModel = freeformPathModel(fitted)!;
    const original = freeformPathModel(element)!.subpaths[0].nodes;
    fittedModel.subpaths[0].nodes.forEach((node, i) => {
      if (i !== 2) close(after.toCanvas(node), before.toCanvas(original[i]));
    });
    close(after.toCanvas(fittedModel.subpaths[0].nodes[2]), before.toCanvas({ x: 260, y: 140 }));
  });
  it("maps canvas points back into a scaled freeform", () => {
    const element = shape({ freeform: { d: "M0 0 L10 0 L10 10 Z", w: 10, h: 10, closed: true } }, { rotation: 90 });
    const t = freeformTransform(element);
    close(t.fromCanvas(t.toCanvas({ x: 3, y: 7 })), { x: 3, y: 7 });
  });
});
