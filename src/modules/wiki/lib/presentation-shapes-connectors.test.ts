import { describe, expect, it } from "vitest";
import type { PresentationElement } from "./presentation";
import { adjustFromPoint, adjustHandlePoint, adjustableShapeKinds, defaultShapeAdjust, shapeOutlinePath } from "./presentation-shape-geometry";
import { connectorBox, facingSite, lineEnds, nearestSite, outlinePoint, routeConnector, setLineEnd, setLineRoute, sitePoint } from "./presentation-connectors";

const box = (id: string, x: number, y: number, rotation = 0, shape = "rect"): PresentationElement =>
  ({ id, type: "shape", x, y, width: 100, height: 50, rotation, content: { shape: shape as "rect", fill: "", stroke: "", strokeWidth: 2, opacity: 1 } });

describe("shape outlines and adjustment handles", () => {
  it("draws every new kind as a closed path inside its box", () => {
    for (const kind of ["pentagon", "hexagon", "star", "parallelogram", "trapezoid", "chevron", "callout", "plus", "roundedRect"]) {
      const path = shapeOutlinePath(kind, 200, 100, 1)!;
      expect(path, kind).toMatch(/Z$/);
      const numbers = path.match(/-?\d+(\.\d+)?/g)!.map(Number);
      expect(Math.min(...numbers), kind).toBeGreaterThanOrEqual(0);
      expect(Math.max(...numbers), kind).toBeLessThanOrEqual(200);
    }
    expect(shapeOutlinePath("rect", 10, 10, 0)).toBeNull();
  });
  it("round-trips the handle position and the setting it stands for", () => {
    for (const kind of adjustableShapeKinds) {
      if (kind === "roundedRect") continue;
      const adjust = kind === "star" ? 0.6 : 0.3;
      const point = adjustHandlePoint(kind, 200, 100, adjust)!;
      expect(adjustFromPoint(kind, 200, 100, point).adjust, kind).toBeCloseTo(adjust, 5);
    }
    expect(adjustFromPoint("roundedRect", 200, 100, adjustHandlePoint("roundedRect", 200, 100, 0, 30)!)).toEqual({ cornerRadius: 30 });
  });
  it("clamps dragged handles to sensible ranges", () => {
    expect(adjustFromPoint("roundedRect", 200, 100, { x: 999, y: 0 })).toEqual({ cornerRadius: 50 });
    expect(adjustFromPoint("star", 200, 100, { x: 0, y: 500 }).adjust).toBe(0.05);
    expect(defaultShapeAdjust("chevron")).toBe(0.3);
  });
});

describe("connectors", () => {
  const a = box("a", 0, 0), b = box("b", 300, 200);
  it("finds sites on the rotated box and the nearest one to a point", () => {
    expect(sitePoint(a, "right")).toEqual({ x: 100, y: 25 });
    const turned = sitePoint(box("r", 0, 0, 90), "top");
    expect(turned.x).toBeCloseTo(75); expect(turned.y).toBeCloseTo(25);
    expect(nearestSite(a, { x: 50, y: -40 })).toBe("top");
    expect(facingSite(a, { x: 400, y: 30 })).toBe("right");
    expect(outlinePoint(a, { x: 500, y: 25 })).toEqual({ x: 100, y: 25 });
  });
  it("routes straight between outlines, elbows with right angles and curves through controls", () => {
    expect(routeConnector({ element: a }, { element: b }, "straight").points).toHaveLength(2);
    const elbow = routeConnector({ element: a, site: "right" }, { element: b, site: "left" }, "elbow").points;
    expect(elbow[0]).toEqual({ x: 100, y: 25 }); expect(elbow.at(-1)).toEqual({ x: 300, y: 225 });
    for (let i = 1; i < elbow.length; i++) expect(elbow[i].x === elbow[i - 1].x || elbow[i].y === elbow[i - 1].y).toBe(true);
    const mixed = routeConnector({ element: a, site: "bottom" }, { element: b, site: "left" }, "elbow").points;
    expect(mixed).toEqual([{ x: 50, y: 50 }, { x: 50, y: 225 }, { x: 300, y: 225 }]);
    const curve = routeConnector({ element: a, site: "right" }, { point: { x: 400, y: 25 } }, "curve").points;
    expect(curve).toHaveLength(4); expect(curve[1].x).toBeGreaterThan(100); expect(curve[1].y).toBe(25);
  });
  it("frames a routed path in a padded box with local points", () => {
    const { x, y, width, height, local } = connectorBox([{ x: 100, y: 25 }, { x: 300, y: 225 }]);
    expect([x, y]).toEqual([76, 1]); expect([width, height]).toEqual([248, 248]);
    expect(local).toEqual([{ x: 24, y: 24 }, { x: 224, y: 224 }]);
  });
});

describe("dropping line ends and switching routes", () => {
  const line = (): Extract<PresentationElement, { type: "shape" }> => ({ id: "l", type: "shape", x: 500, y: 490, width: 200, height: 20, rotation: 0, content: { shape: "arrow", fill: "", stroke: "", strokeWidth: 2, opacity: 1 } });
  const a = box("a", 0, 0), b = box("b", 300, 200);
  const byId = new Map([a, b].map((element) => [element.id, element]));
  it("glues a dropped end to a site and keeps the other end free where it was", () => {
    const glued = setLineEnd(line(), 0, { element: a, site: "right" }, byId);
    expect(glued.content.connection).toMatchObject({ fromId: "a", fromSite: "right", to: { x: 700, y: 500 } });
    expect(lineEnds(glued)[0].x).toBeCloseTo(100); expect(lineEnds(glued)[0].y).toBeCloseTo(25);
    expect(lineEnds(glued)[1].x).toBeCloseTo(700); expect(lineEnds(glued)[1].y).toBeCloseTo(500);
  });
  it("frees an end dropped on empty canvas and turns back into a plain line without glue", () => {
    const glued = setLineEnd(line(), 0, { element: a, site: "right" }, byId);
    const loose = setLineEnd(glued, 0, { point: { x: 400, y: 500 } }, byId);
    expect(loose.content.connection).toBeUndefined();
    expect(loose).toMatchObject({ x: 400, width: 300, rotation: 0 });
  });
  it("routes a free line as an elbow or curve and back, keeping its ends", () => {
    const diagonal = { ...line(), x: 0, y: 0, width: 100 * Math.SQRT2, rotation: 45 };
    const [start, end] = lineEnds(diagonal);
    for (const route of ["elbow", "curve"] as const) {
      const routed = setLineRoute(diagonal, route, byId);
      expect(routed.content.route).toBe(route); expect(routed.rotation).toBe(0);
      const ends = lineEnds(routed);
      expect(ends[0].x).toBeCloseTo(start.x); expect(ends[1].y).toBeCloseTo(end.y);
      const back = setLineRoute(routed, "straight", byId);
      expect(back.content.points).toBeUndefined(); expect(back.rotation).toBeCloseTo(45);
    }
  });
});
