import { describe, expect, it } from "vitest";
import { MAX_DAY_WIDTH, MIN_DAY_WIDTH } from "./portfolio-constants";
import { rowFocusViewport } from "./timeline-row-focus";

describe("rowFocusViewport", () => {
  it("returns null for rows without both dates", () => {
    expect(rowFocusViewport({ rangeStart: "2026-01-01", startDate: null, dueDate: "2026-02-01", availableWidth: 600 })).toBeNull();
    expect(rowFocusViewport({ rangeStart: "2026-01-01", startDate: "2026-02-01", dueDate: null, availableWidth: 600 })).toBeNull();
  });

  it("fits the inclusive date range exactly into the available width", () => {
    const result = rowFocusViewport({ rangeStart: "2026-01-01", startDate: "2026-01-11", dueDate: "2026-02-09", availableWidth: 600 });
    expect(result).toEqual({ dayWidth: 20, scrollLeft: 200 });
  });

  it("caps zoom-in for short ranges and centres them", () => {
    const result = rowFocusViewport({ rangeStart: "2026-01-01", startDate: "2026-01-21", dueDate: "2026-01-21", availableWidth: 440 });
    expect(result?.dayWidth).toBe(MAX_DAY_WIDTH);
    expect(result?.scrollLeft).toBe(20 * MAX_DAY_WIDTH - (440 - MAX_DAY_WIDTH) / 2);
  });

  it("caps zoom-out for long ranges and aligns the start", () => {
    const result = rowFocusViewport({ rangeStart: "2025-01-01", startDate: "2025-01-11", dueDate: "2026-12-31", availableWidth: 300 });
    expect(result).toEqual({ dayWidth: MIN_DAY_WIDTH, scrollLeft: 10 * MIN_DAY_WIDTH });
  });

  it("fits a year-long project into a laptop-width timeline (BUG-14)", () => {
    // 2026-01-01..2026-12-31 is 365 inclusive days; a laptop leaves ~730px for the timeline.
    const result = rowFocusViewport({ rangeStart: "2025-12-25", startDate: "2026-01-01", dueDate: "2026-12-31", availableWidth: 730 });
    expect(result).toEqual({ dayWidth: 2, scrollLeft: 14 });
    expect(365 * (result?.dayWidth ?? 0)).toBeLessThanOrEqual(730);
  });

  it("never scrolls before the timeline start", () => {
    const result = rowFocusViewport({ rangeStart: "2026-01-01", startDate: "2026-01-01", dueDate: "2026-01-02", availableWidth: 600 });
    expect(result?.scrollLeft).toBe(0);
  });
});
