import { describe, expect, it } from "vitest";
import type { CalendarItem, CalendarItemKind } from "../../../types";
import { fitCell, isBackgroundSpan, isoWeek, layoutMonthWeek, weekRows } from "./month-layout";

type Item = Pick<CalendarItem, "id" | "kind" | "title" | "allDay" | "startDate" | "endDate" | "startAt" | "endAt">;
const base = { startAt: null, endAt: null, startDate: null, endDate: null };
const allDay = (id: string, startDate: string, endDate: string, kind: CalendarItemKind = "event"): Item => ({
  ...base, id, title: id, kind, allDay: true, startDate, endDate,
});
const timed = (id: string, startAt: string, endAt: string, kind: CalendarItemKind = "event"): Item => ({
  ...base, id, title: id, kind, allDay: false, startAt, endAt,
});
const tz = "Europe/Vienna";
// Monday 2026-09-28 .. Sunday 2026-10-04
const week = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"];
const layout = (items: Item[], options?: Parameters<typeof layoutMonthWeek>[3]) =>
  layoutMonthWeek(items, week, tz, options);

describe("month layout", () => {
  it("computes ISO week numbers including year boundaries", () => {
    expect(isoWeek("2026-10-01")).toBe(40);
    expect(isoWeek("2026-01-01")).toBe(1);
    expect(isoWeek("2027-01-01")).toBe(53);
    expect(isoWeek("2024-12-30")).toBe(1);
  });

  it("splits days into week rows", () => {
    expect(weekRows([...week, ...week]).map((row) => row.length)).toEqual([7, 7]);
  });

  it("treats projects and spans of two weeks or more as background", () => {
    expect(isBackgroundSpan(allDay("p", "2026-09-29", "2026-09-30", "project"), tz)).toBe(true);
    expect(isBackgroundSpan(allDay("long", "2026-09-01", "2026-09-15"), tz)).toBe(true);
    expect(isBackgroundSpan(allDay("short", "2026-09-01", "2026-09-14"), tz)).toBe(false);
  });

  it("renders multi-day items as bars with open ends where they continue", () => {
    const result = layout([
      allDay("trip", "2026-09-26", "2026-09-30"),
      allDay("leave", "2026-10-02", "2026-10-07"),
      timed("night", "2026-09-30T20:00:00Z", "2026-10-01T06:00:00Z"),
    ]);
    expect(
      result.bars.map((bar) => [bar.item.id, bar.lane, bar.startColumn, bar.endColumn, bar.continuesBefore, bar.continuesAfter]),
    ).toEqual([
      ["trip", 0, 0, 2, true, false],
      ["night", 0, 2, 4, false, false],
      ["leave", 0, 4, 7, false, true],
    ]);
    expect(result.lanes).toBe(1);
    expect(result.cells.every((cell) => cell.entries.length === 0)).toBe(true);
  });

  it("collapses long-running spans into the ongoing list unless expanded", () => {
    const items = [
      allDay("Project B", "2026-08-01", "2026-12-01", "project"),
      allDay("Project A", "2026-09-01", "2026-11-01", "project"),
      allDay("Sabbatical", "2026-09-20", "2026-10-20"),
      allDay("offsite", "2026-09-29", "2026-10-01"),
    ];
    const collapsed = layout(items);
    expect(collapsed.ongoing.map((item) => item.id)).toEqual(["Project A", "Project B", "Sabbatical"]);
    expect(collapsed.bars.map((bar) => bar.item.id)).toEqual(["offsite"]);
    const expanded = layout(items, { expanded: true });
    expect(expanded.ongoing).toEqual([]);
    expect(expanded.lanes).toBe(4);
    expect(expanded.bars.map((bar) => bar.item.id).sort()).toEqual(["Project A", "Project B", "Sabbatical", "offsite"]);
  });

  it("keeps multi-day tasks out of the bar lanes", () => {
    const result = layout([
      allDay("task-span", "2026-09-28", "2026-10-05", "task"),
      timed("meeting", "2026-09-29T08:00:00Z", "2026-09-29T09:00:00Z"),
    ]);
    expect(result.bars).toEqual([]);
    expect(result.cells[1].entries.map((item) => item.id)).toEqual(["meeting"]);
    expect(result.cells.every((cell) => cell.tasks.length + cell.taskChip === 1)).toBe(true);
  });

  it("sorts single-day entries by time and folds tasks into a chip when crowded", () => {
    const result = layout([
      timed("late", "2026-09-29T14:00:00Z", "2026-09-29T15:00:00Z"),
      timed("early", "2026-09-29T07:00:00Z", "2026-09-29T08:00:00Z"),
      allDay("holiday", "2026-09-29", "2026-09-30"),
      allDay("t1", "2026-09-29", "2026-09-30", "task"),
      allDay("t2", "2026-09-29", "2026-09-30", "task"),
    ]);
    const cell = result.cells[1];
    expect(cell.entries.map((item) => item.id)).toEqual(["holiday", "early", "late"]);
    expect(cell.tasks).toEqual([]);
    expect(cell.taskChip).toBe(2);
    expect(cell.hidden).toBe(0);
  });

  it("caps bar lanes and counts hidden bars per day", () => {
    const result = layout([
      allDay("a", "2026-09-28", "2026-09-30"),
      allDay("b", "2026-09-28", "2026-09-30"),
      allDay("c", "2026-09-28", "2026-09-30"),
    ]);
    expect(result.lanes).toBe(2);
    expect(result.bars).toHaveLength(2);
    expect(result.cells.map((cell) => cell.hidden)).toEqual([1, 1, 0, 0, 0, 0, 0]);
  });

  it("fits cells into the available slots", () => {
    expect(fitCell("d", ["a", "b"], ["t"], 0, 4)).toEqual({ day: "d", entries: ["a", "b"], tasks: ["t"], taskChip: 0, hidden: 0 });
    expect(fitCell("d", ["a", "b", "c"], ["t", "u"], 0, 4)).toMatchObject({ entries: ["a", "b", "c"], taskChip: 2, hidden: 0 });
    expect(fitCell("d", ["a", "b", "c", "e"], ["t"], 0, 4)).toMatchObject({ entries: ["a", "b", "c"], taskChip: 0, hidden: 2 });
    expect(fitCell("d", ["a"], ["t"], 2, 2)).toMatchObject({ entries: ["a"], taskChip: 0, hidden: 3 });
    expect(fitCell("d", [], ["t"], 1, 2)).toMatchObject({ entries: [], taskChip: 1, hidden: 1 });
  });
});
