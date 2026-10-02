import { describe, expect, it } from "vitest";
import {
  buildQuickEventInput,
  formatQuickDay,
  minutesToTime,
  quickEndDate,
  timeToMinutes,
} from "./quick-create-utils";

describe("minutesToTime", () => {
  it("formats minutes as HH:MM", () => {
    expect(minutesToTime(0)).toBe("00:00");
    expect(minutesToTime(750)).toBe("12:30");
    expect(minutesToTime(23 * 60 + 45)).toBe("23:45");
  });

  it("wraps the end of the day to midnight", () => {
    expect(minutesToTime(1440)).toBe("00:00");
    expect(minutesToTime(1500)).toBe("01:00");
  });
});

describe("timeToMinutes", () => {
  it("parses valid times", () => {
    expect(timeToMinutes("12:30")).toBe(750);
    expect(timeToMinutes("9:05")).toBe(545);
  });

  it("rejects invalid times", () => {
    expect(timeToMinutes("24:00")).toBeNull();
    expect(timeToMinutes("12:60")).toBeNull();
    expect(timeToMinutes("noon")).toBeNull();
  });
});

describe("quickEndDate", () => {
  it("keeps a later end on the same day", () => {
    expect(quickEndDate("2026-10-02", "12:00", "13:00")).toBe("2026-10-02");
  });

  it("moves a midnight end to the next day", () => {
    expect(quickEndDate("2026-10-31", "23:00", "00:00")).toBe("2026-11-01");
  });

  it("rejects an end before or at the start", () => {
    expect(quickEndDate("2026-10-02", "13:00", "12:00")).toBeNull();
    expect(quickEndDate("2026-10-02", "12:00", "12:00")).toBeNull();
    expect(quickEndDate("2026-10-02", "00:00", "00:00")).toBeNull();
  });
});

describe("buildQuickEventInput", () => {
  it("builds a timed, busy event in the given zone", () => {
    const input = buildQuickEventInput({
      title: "  Standup ",
      day: "2026-10-02",
      startTime: "12:00",
      endTime: "13:00",
      calendarId: "cal-1",
      timezone: "Europe/Vienna",
    });
    expect(input).toMatchObject({
      calendarId: "cal-1",
      kind: "event",
      title: "Standup",
      allDay: false,
      startDate: null,
      endDate: null,
      startAt: "2026-10-02T10:00:00.000Z",
      endAt: "2026-10-02T11:00:00.000Z",
      timezone: "Europe/Vienna",
      availability: "busy",
      attendeeIds: [],
      allowConflicts: false,
    });
  });

  it("passes allowConflicts through and returns null for invalid ranges", () => {
    const base = {
      title: "x",
      day: "2026-10-02",
      calendarId: "cal-1",
      timezone: "Europe/Vienna",
    };
    expect(
      buildQuickEventInput({ ...base, startTime: "09:00", endTime: "10:00", allowConflicts: true })
        ?.allowConflicts,
    ).toBe(true);
    expect(buildQuickEventInput({ ...base, startTime: "10:00", endTime: "09:00" })).toBeNull();
  });
});

describe("formatQuickDay", () => {
  it("formats the day in the locale without shifting it", () => {
    expect(formatQuickDay("2026-10-02", "de-AT")).toBe("Fr., 2. Okt.");
    expect(formatQuickDay("2026-10-02", "en")).toBe("Fri, Oct 2");
  });
});
