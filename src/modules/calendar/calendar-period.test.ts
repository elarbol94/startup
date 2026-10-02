import { describe, expect, it } from "vitest";
import { calendarViewRange, shiftPeriodDate } from "./calendar-period";

describe("calendar periods", () => {
  it("loads a single day for the day view", () => {
    expect(calendarViewRange("day", "2026-10-02", 1)).toEqual({ from: "2026-10-02", to: "2026-10-03" });
  });

  it("loads Monday to Friday for the work week, whatever the week start", () => {
    expect(calendarViewRange("workweek", "2026-10-02", 1)).toEqual({ from: "2026-09-28", to: "2026-10-03" });
    expect(calendarViewRange("workweek", "2026-10-04", 1)).toEqual({ from: "2026-09-28", to: "2026-10-03" });
    // With Sunday as week start, Sunday 4 Oct belongs to the week of Monday 5 Oct.
    expect(calendarViewRange("workweek", "2026-10-04", 0)).toEqual({ from: "2026-10-05", to: "2026-10-10" });
  });

  it("respects the configured week start for week and month views", () => {
    expect(calendarViewRange("week", "2026-10-02", 1)).toEqual({ from: "2026-09-28", to: "2026-10-05" });
    expect(calendarViewRange("week", "2026-10-02", 0)).toEqual({ from: "2026-09-27", to: "2026-10-04" });
    expect(calendarViewRange("month", "2026-10-15", 1).from).toBe("2026-09-28");
    expect(calendarViewRange("month", "2026-10-15", 0).from).toBe("2026-09-27");
  });

  it("steps by the size of each view", () => {
    expect(shiftPeriodDate("day", "2026-10-02", 1)).toBe("2026-10-03");
    expect(shiftPeriodDate("workweek", "2026-10-02", -1)).toBe("2026-09-25");
    expect(shiftPeriodDate("week", "2026-10-02", 1)).toBe("2026-10-09");
    expect(shiftPeriodDate("team", "2026-10-02", 1)).toBe("2026-10-09");
    expect(shiftPeriodDate("month", "2026-01-31", 1)).toBe("2026-02-01");
    expect(shiftPeriodDate("agenda", "2026-10-02", 1)).toBe("2026-11-01");
  });
});
