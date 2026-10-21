import { describe, expect, it } from "vitest";
import { presetConnectionSites, presetDefaultAdjustments, presetHandles, presetPaths, presetShapeNames, presetTextRect, solvePresetHandle } from "./preset-geometry";
import { presetGallery } from "./preset-gallery";

const numbers = (d: string) => (d.match(/-?\d+(\.\d+)?(e-?\d+)?/g) ?? []).map(Number);

describe("DrawingML preset evaluation", () => {
  it("evaluates every one of the 187 presets to finite paths at several sizes", () => {
    expect(presetShapeNames).toHaveLength(187);
    for (const name of presetShapeNames) for (const [w, h] of [[100, 100], [240, 60], [20, 300]]) {
      const paths = presetPaths(name, w, h);
      expect(paths.length, name).toBeGreaterThan(0);
      for (const path of paths) {
        expect(path.d, name).toMatch(/^M/);
        expect(numbers(path.d).every(Number.isFinite), `${name} ${w}x${h}`).toBe(true);
      }
    }
  });
  it("draws a rectangle and PowerPoint's default rounded rectangle exactly", () => {
    expect(presetPaths("rect", 200, 100)[0].d).toBe("M0 0 L200 0 L200 100 L0 100 Z");
    // adj 16667 of the shorter side: a 100 pt tall box has 16.667 pt corners.
    const rounded = presetPaths("roundRect", 200, 100)[0].d;
    expect(rounded.startsWith("M0 16.667 A16.667 16.667 0 0 1 16.667 0 L183.333 0")).toBe(true);
  });
  it("closes an ellipse with two half arcs and gives a 5-point star ten corners", () => {
    expect(presetPaths("ellipse", 100, 60)[0].d.match(/A/g)).toHaveLength(4);
    expect(presetPaths("star5", 100, 100)[0].d.match(/L/g)).toHaveLength(9);
  });
  it("keeps per-path fill and stroke modes (e.g. the can's shaded lid)", () => {
    const can = presetPaths("can", 100, 150);
    expect(can.map((path) => [path.fill, path.stroke])).toEqual([["norm", false], ["lighten", false], ["none", true]]);
  });
  it("reads default adjustments, text areas and connection sites", () => {
    expect(presetDefaultAdjustments("rightArrow")).toEqual({ adj1: 50000, adj2: 50000 });
    expect(presetTextRect("rect", 100, 50)).toEqual({ x: 0, y: 0, width: 100, height: 50 });
    expect(presetConnectionSites("rect", 100, 50).map(({ x, y }) => [x, y])).toEqual([[50, 0], [0, 25], [50, 50], [100, 25]]);
  });
  it("solves a dragged handle back to the adjustment PowerPoint would store", () => {
    const [handle] = presetHandles("roundRect", 100, 100);
    expect(handle).toMatchObject({ x: 16.667, y: 0, refs: ["adj"] });
    const solved = solvePresetHandle("roundRect", 100, 100, {}, 0, { x: 30, y: 4 });
    expect(solved.adj).toBeCloseTo(30000, -2);
    // Clamped to the handle's range: a rounded rectangle's radius stops at half the side.
    expect(solvePresetHandle("roundRect", 100, 100, {}, 0, { x: 90, y: 0 }).adj).toBeCloseTo(50000, -2);
  });
  it("solves polar handles too (block arc thickness and angle)", () => {
    const before = presetHandles("blockArc", 100, 100);
    const solved = solvePresetHandle("blockArc", 100, 100, {}, 0, { x: before[0].x + 5, y: before[0].y + 20 });
    const after = presetHandles("blockArc", 100, 100, solved)[0];
    expect(Math.hypot(after.x - before[0].x - 5, after.y - before[0].y - 20)).toBeLessThan(Math.hypot(5, 20));
  });
});

describe("PowerPoint gallery catalogue", () => {
  it("lists PowerPoint's eight categories and 172 entries, every shape a known preset", () => {
    expect(presetGallery.map((group) => group.category)).toEqual(["basic", "lines", "arrows", "callouts", "symbols", "flowchart", "starsAndBanners", "buttons"]);
    expect(presetGallery.flatMap((group) => group.entries)).toHaveLength(172);
    for (const entry of presetGallery.flatMap((group) => group.entries)) if (!entry.tool) expect(presetShapeNames, entry.id).toContain(entry.id);
  });
});
