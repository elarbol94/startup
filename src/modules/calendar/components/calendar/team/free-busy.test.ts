import { describe, expect, it } from "vitest";
import {
  assignLanes,
  clipInterval,
  clockToMinutes,
  freeWindows,
  hourTicks,
  mergeIntervals,
  minutesToClock,
  percentOf,
  workingRange,
} from "./free-busy";

describe("clock helpers", () => {
  it("parses and formats clocks", () => {
    expect(clockToMinutes("08:30")).toBe(510);
    expect(clockToMinutes("24:00")).toBe(1440);
    expect(clockToMinutes("25:00")).toBeNull();
    expect(clockToMinutes("8")).toBeNull();
    expect(minutesToClock(510)).toBe("08:30");
    expect(minutesToClock(1440)).toBe("24:00");
  });

  it("falls back to 08–17 for an invalid working day", () => {
    expect(workingRange("09:00", "18:00")).toEqual({ start: 540, end: 1080 });
    expect(workingRange("18:00", "09:00")).toEqual({ start: 480, end: 1020 });
    expect(workingRange("x", "17:00")).toEqual({ start: 480, end: 1020 });
  });
});

describe("mergeIntervals", () => {
  it("merges overlapping and touching intervals in order", () => {
    expect(
      mergeIntervals([
        { start: 600, end: 660 },
        { start: 480, end: 540 },
        { start: 540, end: 570 },
        { start: 630, end: 700 },
        { start: 800, end: 800 },
      ]),
    ).toEqual([
      { start: 480, end: 570 },
      { start: 600, end: 700 },
    ]);
  });

  it("does not mutate its input", () => {
    const input = [{ start: 0, end: 10 }, { start: 5, end: 20 }];
    mergeIntervals(input);
    expect(input[0]).toEqual({ start: 0, end: 10 });
  });
});

describe("freeWindows", () => {
  const day = { start: 480, end: 1020 };

  it("returns the whole range when nobody is busy", () => {
    expect(freeWindows([], day)).toEqual([day]);
  });

  it("returns gaps of at least 30 minutes between merged busy blocks", () => {
    expect(
      freeWindows(
        [
          { start: 420, end: 540 }, // before work until 09:00
          { start: 560, end: 600 }, // leaves a 20-minute gap → dropped
          { start: 590, end: 720 },
          { start: 900, end: 1200 }, // runs past the end of the day
        ],
        day,
      ),
    ).toEqual([{ start: 720, end: 900 }]);
  });

  it("honours a custom minimum length", () => {
    expect(freeWindows([{ start: 500, end: 1020 }], day, 15)).toEqual([{ start: 480, end: 500 }]);
    expect(freeWindows([{ start: 500, end: 1020 }], day)).toEqual([]);
  });
});

describe("assignLanes", () => {
  it("puts overlapping intervals into parallel lanes per cluster", () => {
    const result = assignLanes([
      { start: 0, end: 60, id: "a" },
      { start: 30, end: 90, id: "b" },
      { start: 60, end: 120, id: "c" },
      { start: 200, end: 260, id: "d" },
    ]);
    const byId = Object.fromEntries(result.map((entry) => [entry.item.id, entry]));
    expect(byId.a).toMatchObject({ lane: 0, lanes: 2 });
    expect(byId.b).toMatchObject({ lane: 1, lanes: 2 });
    expect(byId.c).toMatchObject({ lane: 0, lanes: 2 });
    expect(byId.d).toMatchObject({ lane: 0, lanes: 1 });
  });
});

describe("geometry", () => {
  it("clips, ticks and positions intervals", () => {
    const range = { start: 480, end: 1020 };
    expect(clipInterval({ start: 400, end: 500 }, range)).toEqual({ start: 480, end: 500 });
    expect(clipInterval({ start: 1100, end: 1200 }, range)).toBeNull();
    expect(hourTicks(range, 4)).toEqual([480, 720, 960]);
    expect(hourTicks({ start: 510, end: 600 }, 1)).toEqual([540]);
    expect(percentOf({ start: 480, end: 750 }, range)).toEqual({ left: 0, width: 50 });
  });
});
