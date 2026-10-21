import { describe, expect, it } from "vitest";
import type { PresentationElement } from "./presentation";
import { FRAME_RAIL_GAP, nextFrameBounds } from "./presentation-frame-rail";

const frame = (id: string, x: number, y = 0, width = 960, height = 540, isGroup = false): PresentationElement =>
  ({ id, type: "frame", x, y, width, height, rotation: 0, content: { label: id, shape: "rect", color: "", isGroup } });

describe("next frame in the rail", () => {
  it("starts at the origin on an empty canvas", () => {
    expect(nextFrameBounds([], [])).toEqual({ x: 0, y: 0, width: 960, height: 540 });
  });
  it("follows the last frame in playback order, at its size", () => {
    const elements = [frame("a", 0), frame("b", 5000, 300, 800, 450)];
    expect(nextFrameBounds(elements, [{ id: "s2", elementId: "b" }, { id: "s1", elementId: "a" }])).toEqual({ x: 960 + FRAME_RAIL_GAP, y: 0, width: 960, height: 540 });
    expect(nextFrameBounds(elements, [])).toEqual({ x: 5800 + FRAME_RAIL_GAP, y: 300, width: 800, height: 450 });
  });
  it("skips frames already in the way and ignores groups", () => {
    const elements = [frame("a", 0), frame("b", 1080), frame("g", 3000, 0, 100, 100, true)];
    expect(nextFrameBounds(elements, [{ id: "s", elementId: "a" }]).x).toBe(2160);
  });
});
