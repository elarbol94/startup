import { describe, expect, it } from "vitest";
import { applyBoardMove, laneAtPoint } from "./board-drop";

const lanes = [
  { id: "todo", rect: { left: 0, right: 200, top: 0, bottom: 600 } },
  { id: "in_progress", rect: { left: 208, right: 408, top: 0, bottom: 600 } },
  { id: "done", rect: { left: 416, right: 616, top: 0, bottom: 600 } },
];

describe("dashboard board drop target", () => {
  it("uses the lane under the pointer anywhere in its column", () => {
    expect(laneAtPoint({ x: 100, y: 20 }, lanes)).toBe("todo");
    expect(laneAtPoint({ x: 500, y: 590 }, lanes)).toBe("done");
  });

  it("snaps to the nearest lane in the gap between lanes", () => {
    expect(laneAtPoint({ x: 203, y: 300 }, lanes)).toBe("todo");
    expect(laneAtPoint({ x: 206, y: 300 }, lanes)).toBe("in_progress");
  });

  it("drops nowhere when the pointer leaves the board", () => {
    expect(laneAtPoint({ x: 100, y: 700 }, lanes)).toBeNull();
    expect(laneAtPoint({ x: 700, y: 300 }, lanes)).toBeNull();
    expect(laneAtPoint(null, lanes)).toBeNull();
  });
});

describe("optimistic board move", () => {
  it("moves only the dragged task and marks it as saving", () => {
    const rows = [{ id: "a", boardStage: "todo" as const }, { id: "b", boardStage: "todo" as const }];
    expect(applyBoardMove(rows, { id: "a", stage: "done" })).toEqual([
      { id: "a", boardStage: "done", moving: true },
      { id: "b", boardStage: "todo" },
    ]);
  });
});
