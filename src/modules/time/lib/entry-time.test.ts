import { describe, expect, it } from "vitest";
import { intervalFromClock, overlaps, parseClock } from "./entry-time";

describe("entry time parsing", () => {
  it("parses HH:MM clock values", () => {
    expect(parseClock("08:30")).toBe(510);
    expect(() => parseClock("24:00")).toThrow();
    expect(() => parseClock("8:30")).toThrow();
  });

  it("converts Vienna local times to instants, including overnight and DST", () => {
    expect(intervalFromClock("2026-07-28", "08:00", "16:30")).toEqual({
      startedAt: new Date("2026-07-28T06:00:00Z"),
      endedAt: new Date("2026-07-28T14:30:00Z"),
    });
    expect(intervalFromClock("2026-07-28", "22:00", "06:00")).toEqual({
      startedAt: new Date("2026-07-28T20:00:00Z"),
      endedAt: new Date("2026-07-29T04:00:00Z"),
    });
    const dst = intervalFromClock("2026-03-29", "01:00", "04:00");
    expect(dst.endedAt.getTime() - dst.startedAt.getTime()).toBe(2 * 3_600_000);
    expect(() => intervalFromClock("2026-07-28", "08:00", "08:00")).toThrow();
  });

  it("detects overlapping intervals, treating running entries as ending now", () => {
    const now = new Date("2026-07-28T12:00:00Z");
    const a = { startedAt: new Date("2026-07-28T06:00:00Z"), endedAt: new Date("2026-07-28T10:00:00Z") };
    expect(overlaps(a, { startedAt: new Date("2026-07-28T10:00:00Z"), endedAt: null }, now)).toBe(false);
    expect(overlaps(a, { startedAt: new Date("2026-07-28T09:59:00Z"), endedAt: null }, now)).toBe(true);
  });
});
