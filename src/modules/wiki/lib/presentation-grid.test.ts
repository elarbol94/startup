import { describe, expect, it } from "vitest";
import type { PresentationElement } from "./presentation-model";
import {
  PRESENTATION_CM, defaultGuides, gridDisplayGap, gridSpacingChoice, gridSpacingChoices, guideLines, rulerOrigin, rulerTicks,
  snapBoxToGrid, snapBoxToGridAndGuides, snapToGrid,
} from "./presentation-grid";
import { applyGeometryChanges, snapBounds } from "./presentation-transform";

const frame = (id: string, x: number, y: number, width: number, height: number, isGroup = false) =>
  ({ id, type: "frame", x, y, width, height, rotation: 0, content: { shape: "rectangle", ...(isGroup ? { isGroup: true } : {}) } }) as unknown as PresentationElement;
const shape = (id: string, x: number, y: number, width = 100, height = 50) =>
  ({ id, type: "shape", x, y, width, height, rotation: 0, content: { kind: "rectangle" } }) as unknown as PresentationElement;

describe("grid spacing choices", () => {
  it("lists PowerPoint's spacings from 1/8 cm to 5 cm in pt", () => {
    expect(gridSpacingChoices.map(c => c.key)).toEqual(["perCm8", "perCm6", "perCm5", "perCm4", "perCm3", "perCm2", "cm1", "cm2", "cm3", "cm4", "cm5"]);
    expect(gridSpacingChoices[0].spacing).toBeCloseTo(28.35 / 8);
    expect(gridSpacingChoice(28.35)?.key).toBe("cm1");
    expect(gridSpacingChoice(30)).toBeUndefined();
  });
});

describe("guides and ruler origin", () => {
  it("creates a vertical and a horizontal guide through the centre", () => {
    let n = 0;
    expect(defaultGuides({ x: 10, y: 20 }, () => `g${++n}`)).toEqual([{ id: "g1", axis: "x", position: 10 }, { id: "g2", axis: "y", position: 20 }]);
    expect(guideLines([{ id: "a", axis: "x", position: 1 }, { id: "b", axis: "y", position: 2 }, { id: "c", axis: "x", position: 3 }])).toEqual({ x: [1, 3], y: [2] });
  });

  it("counts from the frame under the viewport centre, else the nearest frame, ignoring groups", () => {
    const elements = [frame("big", 0, 0, 1000, 1000), frame("inner", 100, 100, 200, 100), frame("group", 400, 400, 100, 100, true), frame("far", 3000, 0, 100, 100)];
    expect(rulerOrigin(elements, { x: 150, y: 150 })).toEqual({ x: 200, y: 150 });
    expect(rulerOrigin(elements, { x: 450, y: 450 })).toEqual({ x: 500, y: 500 });
    expect(rulerOrigin(elements, { x: 2900, y: 50 })).toEqual({ x: 3050, y: 50 });
    expect(rulerOrigin([frame("group", 0, 0, 10, 10, true)], { x: 5, y: 5 })).toEqual({ x: 0, y: 0 });
  });
});

describe("ruler ticks", () => {
  it("labels every centimetre at 100% with quarter-centimetre ticks between", () => {
    const ticks = rulerTicks(-PRESENTATION_CM, 2 * PRESENTATION_CM, 2);
    expect(ticks.filter(t => t.kind === "major").map(t => t.label)).toEqual([-1, 0, 1, 2]);
    expect(ticks.filter(t => t.kind === "mid")).toHaveLength(3);
    expect(ticks.filter(t => t.kind === "minor")).toHaveLength(6);
  });

  it("thins labels out so they stay at least 40 px apart", () => {
    for (const zoom of [0.02, 0.1, 0.3, 1, 4]) {
      const majors = rulerTicks(-5000, 5000, zoom).filter(t => t.kind === "major");
      expect(majors.length).toBeGreaterThan(1);
      expect((majors[1].position - majors[0].position) * zoom).toBeGreaterThanOrEqual(40);
    }
    expect(rulerTicks(0, 1000, 0.5).filter(t => t.kind === "major").map(t => t.label).slice(0, 3)).toEqual([0, 5, 10]);
    expect(rulerTicks(10, 5, 1)).toEqual([]);
  });

  it("widens the drawn grid when it would be denser than 8 px", () => {
    expect(gridDisplayGap(28.35, 1)).toBe(28.35);
    expect(gridDisplayGap(28.35, 0.1)).toBeCloseTo(28.35 * 4);
  });
});

describe("grid snapping", () => {
  it("rounds to the nearest grid line", () => {
    expect(snapToGrid(40, 28.35)).toBeCloseTo(28.35);
    expect(snapToGrid(-10, 28.35)).toBe(0);
    expect(Object.is(snapToGrid(-10, 28.35), -0)).toBe(false);
    expect(snapToGrid(13, 0)).toBe(13);
  });

  it("puts a moved box's top-left corner on a grid point and keeps its size", () => {
    expect(snapBoxToGrid({ x: 0, y: 0, width: 33, height: 47 }, { x: 22, y: 61, width: 33, height: 47 }, 20, false)).toEqual({ x: 20, y: 60, width: 33, height: 47 });
  });

  it("snaps only the edges a resize moved, never below the minimum size", () => {
    expect(snapBoxToGrid({ x: 0, y: 0, width: 100, height: 100 }, { x: 0, y: 0, width: 117, height: 100 }, 20, true)).toEqual({ x: 0, y: 0, width: 120, height: 100 });
    expect(snapBoxToGrid({ x: 3, y: 3, width: 100, height: 100 }, { x: 3, y: 3, width: 100, height: 128 }, 20, true)).toEqual({ x: 3, y: 3, width: 100, height: 137 });
    expect(snapBoxToGrid({ x: 0, y: 0, width: 100, height: 100 }, { x: 0, y: 0, width: 44, height: 100 }, 30, true)).toEqual({ x: 0, y: 0, width: 44, height: 100 });
  });

  it("lets a drawing guide pull the grid-snapped box further, and highlights it", () => {
    const result = snapBoxToGridAndGuides({ x: 0, y: 0, width: 100, height: 50 }, { x: 31, y: 18, width: 100, height: 50 }, { grid: 20, guides: { x: [143], y: [] } }, 6);
    expect(result.bounds).toEqual({ x: 43, y: 20, width: 100, height: 50 });
    expect(result.guides).toEqual([{ axis: "x", position: 143, start: 20, end: 70 }]);
  });

  it("snaps a box's centre to a guide within tolerance only", () => {
    const near = snapBoxToGridAndGuides({ x: 0, y: 0, width: 100, height: 50 }, { x: 0, y: 72, width: 100, height: 50 }, { guides: { x: [], y: [100] } }, 6);
    expect(near.bounds.y).toBe(75);
    const far = snapBoxToGridAndGuides({ x: 0, y: 0, width: 100, height: 50 }, { x: 0, y: 60, width: 100, height: 50 }, { guides: { x: [], y: [100] } }, 6);
    expect(far.bounds.y).toBe(60);
    expect(far.guides).toEqual([]);
  });
});

describe("snap options in canvas geometry", () => {
  const elements = [shape("a", 0, 0), shape("b", 300, 200)];

  it("keeps element snapping unchanged without options and turns it off with smart: false", () => {
    const move = [{ id: "a", x: 297, y: 0 }];
    expect(applyGeometryChanges(elements, move, 6).elements[0].x).toBe(300);
    expect(applyGeometryChanges(elements, move, 6, [], undefined, { smart: true }).elements[0].x).toBe(300);
    expect(applyGeometryChanges(elements, move, 6, [], undefined, { smart: false }).elements[0].x).toBe(297);
  });

  it("applies the grid first and lets a nearby element pull the box onto its edge", () => {
    const result = applyGeometryChanges(elements, [{ id: "a", x: 291, y: 13 }], 15, [], undefined, { grid: 22 });
    expect(result.elements[0]).toMatchObject({ x: 300, y: 22 });
    expect(applyGeometryChanges(elements, [{ id: "a", x: 291, y: 13 }], 15, [], undefined, { grid: 22, smart: false }).elements[0]).toMatchObject({ x: 286, y: 22 });
  });

  it("does not snap at all when the tolerance is zero (Alt, numeric edits)", () => {
    expect(applyGeometryChanges(elements, [{ id: "a", x: 291, y: 13 }], 0, [], undefined, { grid: 20 }).elements[0]).toMatchObject({ x: 291, y: 13 });
    expect(snapBounds({ x: 0, y: 0, width: 10, height: 10 }, { x: 3, y: 3, width: 10, height: 10 }, [], 0, false, [], { grid: 20 }).bounds.x).toBe(3);
  });
});

describe("grid transparency", () => {
  it("defaults to a 15 % transparent grid, and keeps that for decks saved before the setting", async () => {
    const { presentationSettingsSchema, defaultPresentationSettings } = await import("./presentation-model");
    expect(defaultPresentationSettings.grid.transparency).toBe(0.15);
    const saved = presentationSettingsSchema.parse({ grid: { spacing: 28.35, snap: false, show: true } });
    expect(saved.grid.transparency).toBe(0.15);
  });
  it("accepts 0 (opaque) and 1 (invisible) and rejects values outside 0..1", async () => {
    const { presentationSettingsSchema } = await import("./presentation-model");
    const parse = (transparency: number) => presentationSettingsSchema.safeParse({ grid: { spacing: 28.35, snap: false, show: true, transparency } }).success;
    expect(parse(0)).toBe(true);
    expect(parse(1)).toBe(true);
    expect(parse(1.2)).toBe(false);
    expect(parse(-0.1)).toBe(false);
  });
});
