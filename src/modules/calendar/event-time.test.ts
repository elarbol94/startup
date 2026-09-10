import { describe, expect, it } from "vitest";
import { adjustEventRange, timedDaySegment } from "./event-time";
const zone = "Europe/Vienna";
describe("multi-day calendar intervals", () => {
  it("clips each day and excludes an exclusive midnight end", () => {
    const start = "2026-09-14T14:00:00Z", end = "2026-09-16T22:00:00Z";
    expect(timedDaySegment(start, end, "2026-09-14", zone)).toEqual({start:960,end:1440,startsHere:true,endsHere:false});
    expect(timedDaySegment(start, end, "2026-09-15", zone)).toEqual({start:0,end:1440,startsHere:false,endsHere:false});
    expect(timedDaySegment(start, end, "2026-09-17", zone)).toBeNull();
  });
  it("moves in quarter hours without changing a multi-day duration", () => {
    expect(adjustEventRange("2026-09-14T07:00:00Z","2026-09-16T08:00:00Z","move",22,1,zone)).toEqual({startAt:"2026-09-15T07:15:00.000Z",endAt:"2026-09-17T08:15:00.000Z"});
  });
  it("resizes either edge and prevents inverted intervals", () => {
    const start="2026-09-14T07:00:00Z",end="2026-09-14T08:00:00Z";
    expect(adjustEventRange(start,end,"start",16,0,zone).startAt).toBe("2026-09-14T07:15:00.000Z");
    expect(adjustEventRange(start,end,"end",-16,0,zone).endAt).toBe("2026-09-14T07:45:00.000Z");
    expect(adjustEventRange(start,end,"end",-120,0,zone).endAt).toBe("2026-09-14T07:15:00.000Z");
  });
  it("preserves local clock time when moving across daylight saving", () => {
    expect(adjustEventRange("2026-10-24T07:00:00Z","2026-10-24T08:00:00Z","move",0,1,zone).startAt).toBe("2026-10-25T08:00:00.000Z");
  });
});
