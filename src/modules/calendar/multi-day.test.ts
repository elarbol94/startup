import { describe, expect, it } from "vitest";
import { buildAgendaGroups, layoutAllDayBars, multiDayLastDay } from "./multi-day";

const base = { startAt: null, endAt: null, startDate: null, endDate: null };
const allDay = (id: string, startDate: string, endDate: string, kind = "event") => ({
  ...base, id, kind, allDay: true, startDate, endDate,
});
const timed = (id: string, startAt: string, endAt: string) => ({
  ...base, id, kind: "event", allDay: false, startAt, endAt,
});
const days = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24"];
const tz = "Europe/Vienna";

describe("multi-day items", () => {
  it("detects multi-day spans for all-day and timed items", () => {
    expect(multiDayLastDay(allDay("a", "2026-09-21", "2026-09-22"), tz)).toBeNull();
    expect(multiDayLastDay(allDay("b", "2026-09-01", "2026-12-01"), tz)).toBe("2026-11-30");
    expect(multiDayLastDay(timed("c", "2026-09-21T08:00:00Z", "2026-09-21T09:00:00Z"), tz)).toBeNull();
    expect(multiDayLastDay(timed("d", "2026-09-21T20:00:00Z", "2026-09-22T08:00:00Z"), tz)).toBe("2026-09-22");
    // Ends exactly at local midnight: still a single day.
    expect(multiDayLastDay(timed("e", "2026-09-21T08:00:00Z", "2026-09-21T22:00:00Z"), tz)).toBeNull();
  });

  it("lists a multi-day item once in the agenda and collapses it to ongoing afterwards", () => {
    const offsite = allDay("offsite", "2026-09-22", "2026-09-25");
    const meeting = timed("meeting", "2026-09-24T08:00:00Z", "2026-09-24T09:00:00Z");
    const groups = buildAgendaGroups([offsite, meeting], days, tz);
    expect(groups.map((group) => group.day)).toEqual(["2026-09-22", "2026-09-24"]);
    expect(groups[0].items).toEqual([{ item: offsite, until: "2026-09-24" }]);
    expect(groups[0].ongoing).toEqual([]);
    expect(groups[1].items.map((entry) => entry.item.id)).toEqual(["meeting"]);
    expect(groups[1].ongoing.map((entry) => entry.item.id)).toEqual(["offsite"]);
  });

  it("puts items already running before the range straight into ongoing", () => {
    const project = allDay("project", "2026-08-01", "2026-12-01", "project");
    const meeting = timed("meeting", "2026-09-23T08:00:00Z", "2026-09-23T09:00:00Z");
    const groups = buildAgendaGroups([project, meeting], days, tz);
    expect(groups.map((group) => group.day)).toEqual(["2026-09-21", "2026-09-23"]);
    expect(groups[0].items).toEqual([]);
    expect(groups[0].ongoing).toEqual([{ item: project, until: "2026-11-30" }]);
    expect(groups[1].items.map((entry) => entry.item.id)).toEqual(["meeting"]);
    expect(groups[1].ongoing.map((entry) => entry.item.id)).toEqual(["project"]);
  });

  it("lays out all-day bars across columns with appointments on top", () => {
    const bars = layoutAllDayBars(
      [
        allDay("project", "2026-08-01", "2026-12-01", "project"),
        allDay("offsite", "2026-09-22", "2026-09-24"),
        allDay("holiday", "2026-09-24", "2026-09-25"),
        allDay("outside", "2026-10-01", "2026-10-02"),
      ],
      days,
    );
    expect(bars.map(({ item, lane, startColumn, endColumn }) => [item.id, lane, startColumn, endColumn])).toEqual([
      ["offsite", 0, 1, 3],
      ["holiday", 0, 3, 4],
      ["project", 1, 0, 4],
    ]);
  });
});
