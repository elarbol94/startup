import { describe, expect, it } from "vitest";
import {
  initialScrollScript,
  isTaskLaneKind,
  isWorkingDay,
  parseClock,
  scrollTargetMinutes,
  snapMinutes,
  workingRange,
} from "./week-utils";

describe("week timeline helpers", () => {
  it("reads working days as JS weekdays (0 = Sunday) and accepts ISO 7", () => {
    expect(isWorkingDay("2026-10-05", [1, 2, 3, 4, 5])).toBe(true); // Monday
    expect(isWorkingDay("2026-10-04", [1, 2, 3, 4, 5])).toBe(false); // Sunday
    expect(isWorkingDay("2026-10-04", [0])).toBe(true);
    expect(isWorkingDay("2026-10-04", [7])).toBe(true);
  });

  it("parses working hours and falls back for invalid ranges", () => {
    expect(parseClock("08:30")).toBe(510);
    expect(parseClock("nope", 42)).toBe(42);
    expect(workingRange({ workingDayStart: "09:00", workingDayEnd: "17:00" })).toEqual({ start: 540, end: 1020 });
    expect(workingRange({ workingDayStart: "18:00", workingDayEnd: "08:00" })).toEqual({ start: 1080, end: 1440 });
  });

  it("snaps to quarter hours inside the day and picks a scroll target", () => {
    expect(snapMinutes(-5)).toBe(0);
    expect(snapMinutes(554)).toBe(540);
    expect(snapMinutes(1500)).toBe(1425);
    expect(scrollTargetMinutes(480, null)).toBe(450);
    expect(scrollTargetMinutes(480, 60)).toBe(0);
    expect(scrollTargetMinutes(480, 840)).toBe(750);
  });

  it("sends tasks and project spans to the tasks row", () => {
    expect(["task", "deadline", "milestone", "project"].every((kind) => isTaskLaneKind(kind as never))).toBe(true);
    expect(isTaskLaneKind("event")).toBe(false);
    expect(isTaskLaneKind("focus")).toBe(false);
  });

  it("builds an initial-scroll script that sets scrollTop on the keyed container", () => {
    const element = { scrollTop: 0 };
    const document = { querySelector: (selector: string) => (selector.includes('"k1"') ? element : null) };
    new Function("document", initialScrollScript("k1", ["1999-01-01"], "Europe/Vienna", 480))(document);
    expect(element.scrollTop).toBe(450);
    expect((element as { __weekScrollKey?: string }).__weekScrollKey).toBe("k1");
    expect(initialScrollScript("k", [], "</script>", 0)).not.toContain("</script>");
  });
});
