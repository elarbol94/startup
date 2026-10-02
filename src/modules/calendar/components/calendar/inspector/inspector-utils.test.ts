import { describe, expect, it } from "vitest";
import { detectJoinUrl, formatDurationShort, formatItemTimeRange, linkifyText } from "./inspector-utils";

const timed = (startAt: string, endAt: string | null) => ({
  allDay: false,
  startDate: null,
  endDate: null,
  startAt,
  endAt,
});

describe("formatItemTimeRange", () => {
  it("formats a same-day timed range with duration in the user's timezone", () => {
    expect(formatItemTimeRange(timed("2026-10-02T08:00:00Z", "2026-10-02T09:00:00Z"), "de-AT", "Europe/Vienna"))
      .toBe("Fr., 2. Okt. 2026 · 10:00–11:00 (1 h)");
    expect(formatItemTimeRange(timed("2026-10-02T08:00:00Z", "2026-10-02T09:30:00Z"), "en-GB", "Europe/Vienna"))
      .toBe("Fri, 2 Oct 2026 · 10:00–11:30 (1 h 30 min)");
  });

  it("shows both dates when a timed event spans midnight", () => {
    const text = formatItemTimeRange(timed("2026-10-02T20:00:00Z", "2026-10-03T00:00:00Z"), "de-AT", "Europe/Vienna");
    expect(text).toBe("Fr., 2. Okt. 2026, 22:00 – Sa., 3. Okt. 2026, 02:00 (4 h)");
  });

  it("uses 24-hour clock and handles missing end", () => {
    expect(formatItemTimeRange(timed("2026-10-02T22:15:00Z", null), "en-US", "UTC")).toContain("22:15");
  });

  it("formats all-day ranges with an exclusive end date", () => {
    const allDay = { allDay: true, startDate: "2026-10-02", endDate: "2026-10-03", startAt: null, endAt: null };
    expect(formatItemTimeRange(allDay, "de-AT", "Europe/Vienna")).toBe("02.10.2026");
    expect(formatItemTimeRange({ ...allDay, endDate: "2026-10-05" }, "de-AT", "Europe/Vienna"))
      .toBe("02.10.2026 – 04.10.2026");
  });
});

describe("formatDurationShort", () => {
  it("formats minutes and hours", () => {
    expect(formatDurationShort(30)).toBe("30 min");
    expect(formatDurationShort(120)).toBe("2 h");
    expect(formatDurationShort(0)).toBe("");
  });
});

describe("detectJoinUrl", () => {
  it("finds explicit http(s) URLs and bare meeting hosts", () => {
    expect(detectJoinUrl("https://example.com/room")).toBe("https://example.com/room");
    expect(detectJoinUrl("Online (https://zoom.us/j/123).")).toBe("https://zoom.us/j/123");
    expect(detectJoinUrl("meet.google.com/abc-defg-hij")).toBe("https://meet.google.com/abc-defg-hij");
    expect(detectJoinUrl("Call via company.zoom.us/j/42")).toBe("https://company.zoom.us/j/42");
  });

  it("ignores plain places and unsafe schemes", () => {
    expect(detectJoinUrl("Besprechungsraum 2")).toBeNull();
    expect(detectJoinUrl("javascript:alert(1)")).toBeNull();
    expect(detectJoinUrl("")).toBeNull();
  });
});

describe("linkifyText", () => {
  it("splits text into safe link segments", () => {
    expect(linkifyText("Agenda: https://example.com/a. Danke")).toEqual([
      { type: "text", value: "Agenda: " },
      { type: "link", value: "https://example.com/a", href: "https://example.com/a" },
      { type: "text", value: ". Danke" },
    ]);
  });

  it("never links non-http schemes", () => {
    expect(linkifyText("javascript:alert(1) data:text/html,x")).toEqual([
      { type: "text", value: "javascript:alert(1) data:text/html,x" },
    ]);
  });

  it("keeps balanced parentheses inside URLs", () => {
    const segments = linkifyText("(see https://en.wikipedia.org/wiki/Foo_(bar))");
    expect(segments[1]).toMatchObject({ type: "link", value: "https://en.wikipedia.org/wiki/Foo_(bar)" });
    expect(segments[2]).toEqual({ type: "text", value: ")" });
  });
});
