import { describe, expect, it } from "vitest";
import { layoutEventColumns } from "./event-layout";

describe("calendar overlap layout", () => {
  it("keeps chained overlaps separate and restores full width after the group", () => {
    const result = layoutEventColumns([
      { id: "c", start: 90, end: 150 },
      { id: "a", start: 0, end: 60 },
      { id: "b", start: 30, end: 120 },
      { id: "d", start: 150, end: 180 },
    ]);
    expect(result.get("a")).toEqual({ column: 0, columns: 2 });
    expect(result.get("b")).toEqual({ column: 1, columns: 2 });
    expect(result.get("c")).toEqual({ column: 0, columns: 2 });
    expect(result.get("d")).toEqual({ column: 0, columns: 1 });
  });
  it("allocates every simultaneous event a distinct column", () => {
    const events = Array.from({ length: 12 }, (_, i) => ({ id: String(i), start: 480, end: 540 }));
    const result = layoutEventColumns(events);
    expect(new Set([...result.values()].map((v) => v.column)).size).toBe(12);
    expect([...result.values()].every((v) => v.columns === 12)).toBe(true);
    expect(layoutEventColumns([]).size).toBe(0);
  });
});
