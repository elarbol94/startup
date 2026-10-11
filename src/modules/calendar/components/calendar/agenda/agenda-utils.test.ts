import { describe, expect, it } from "vitest";
import { buildAgendaDays, formatDayColumn, isWeekend } from "./agenda-utils";

const days = ["2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13"];

describe("agenda day list", () => {
  it("lists nothing for an empty range unless phone padding is asked for", () => {
    expect(buildAgendaDays([], days, "2026-10-11", "Europe/Vienna")).toEqual([]);
    expect(buildAgendaDays([], days, "2026-10-11", "Europe/Vienna", 3).map((group) => group.day)).toEqual([
      "2026-10-09", "2026-10-10", "2026-10-11",
    ]);
  });

  it("keeps today in the padded list even beyond the padding", () => {
    expect(buildAgendaDays([], days, "2026-10-13", "Europe/Vienna", 2).map((group) => group.day)).toEqual([
      "2026-10-09", "2026-10-10", "2026-10-13",
    ]);
  });

  it("knows weekends and formats the date column", () => {
    expect(isWeekend("2026-10-10")).toBe(true);
    expect(isWeekend("2026-10-11")).toBe(true);
    expect(isWeekend("2026-10-12")).toBe(false);
    expect(formatDayColumn("2026-10-12", "de")).toEqual({ weekday: "Mo", day: 12 });
  });
});
