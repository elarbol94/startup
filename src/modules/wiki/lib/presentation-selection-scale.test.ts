import { describe, expect, it } from "vitest";
import { MIN_SELECTION_SCALE, selectionScale } from "./presentation-selection-scale";

const box = { x: 100, y: 100, width: 200, height: 100 };

describe("multi-selection scale handles", () => {
  it("anchors the opposite corner", () => {
    expect(selectionScale(box, { x: 1, y: 1 }, { x: 500, y: 300 }, false, false)).toEqual({ scaleX: 2, scaleY: 2, origin: { x: 100, y: 100 } });
    expect(selectionScale(box, { x: -1, y: -1 }, { x: 200, y: 150 }, false, false)).toEqual({ scaleX: 0.5, scaleY: 0.5, origin: { x: 300, y: 200 } });
  });
  it("scales one axis from an edge handle", () => {
    expect(selectionScale(box, { x: 0, y: 1 }, { x: 999, y: 400 }, false, false)).toEqual({ scaleX: 1, scaleY: 3, origin: { x: 100, y: 100 } });
    expect(selectionScale(box, { x: -1, y: 0 }, { x: 0, y: 0 }, false, false).scaleX).toBe(1.5);
  });
  it("keeps proportions on a corner with Shift and scales from the centre with Alt", () => {
    expect(selectionScale(box, { x: 1, y: 1 }, { x: 500, y: 150 }, true, false)).toMatchObject({ scaleX: 2, scaleY: 2 });
    expect(selectionScale(box, { x: 1, y: 0 }, { x: 400, y: 0 }, false, true)).toEqual({ scaleX: 2, scaleY: 1, origin: { x: 200, y: 150 } });
  });
  it("never flips or collapses, and is absolute rather than incremental", () => {
    expect(selectionScale(box, { x: 1, y: 1 }, { x: -500, y: -500 }, false, false)).toMatchObject({ scaleX: MIN_SELECTION_SCALE, scaleY: MIN_SELECTION_SCALE });
    // Returning to the start point gives exactly 1, whatever happened in between.
    expect(selectionScale(box, { x: 1, y: 1 }, { x: 300, y: 200 }, false, false)).toMatchObject({ scaleX: 1, scaleY: 1 });
  });
});
