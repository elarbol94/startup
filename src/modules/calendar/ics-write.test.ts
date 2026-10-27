import { describe, expect, it } from "vitest";
import { parseIcsFeed } from "./ics-feed";
import { eventToIcs, type WritableEvent } from "./ics-write";

const base: WritableEvent = {
  title: "Förder, Termin; Graz",
  description: "Zeile 1\nZeile 2 \\ Ende",
  location: "Graz",
  allDay: false,
  startDate: null,
  endDate: null,
  startAt: new Date("2026-10-05T07:00:00Z"),
  endAt: new Date("2026-10-05T08:30:00Z"),
  timezone: "Europe/Vienna",
  availability: "busy",
  recurrenceRule: null,
  updatedAt: new Date("2026-10-01T00:00:00Z"),
};

const roundTrip = (text: string) => parseIcsFeed(text, { fallbackTimezone: "Europe/Berlin" }).events;

describe("eventToIcs", () => {
  it("round-trips a single timed event with escaped text", () => {
    const [event] = roundTrip(eventToIcs("a@app", base));
    expect(event).toMatchObject({
      uid: "a@app",
      title: base.title,
      description: base.description,
      location: "Graz",
      allDay: false,
      startAt: base.startAt,
      endAt: base.endAt,
      availability: "busy",
      recurrenceRule: null,
    });
  });

  it("round-trips an all-day free event", () => {
    const [event] = roundTrip(eventToIcs("b@app", {
      ...base, allDay: true, startDate: "2026-10-05", endDate: "2026-10-07", startAt: null, endAt: null, availability: "free",
    }));
    expect(event).toMatchObject({ allDay: true, startDate: "2026-10-05", endDate: "2026-10-07", availability: "free" });
  });

  it("round-trips a zoned series with UNTIL, a cancelled and a moved occurrence", () => {
    const text = eventToIcs(
      "c@app",
      { ...base, recurrenceRule: "FREQ=WEEKLY;UNTIL=20261231T090000" },
      [
        { occurrenceKey: "2026-10-12T07:00:00.000Z", cancelled: true, overrideJson: "{}" },
        {
          occurrenceKey: "2026-10-19T07:00:00.000Z",
          cancelled: false,
          overrideJson: JSON.stringify({ title: "Verschoben", startAt: "2026-10-19T09:00:00.000Z", endAt: "2026-10-19T10:00:00.000Z" }),
        },
      ],
    );
    expect(text).toContain("DTSTART;TZID=Europe/Vienna:20261005T090000");
    expect(text).toContain("UNTIL=20261231T080000Z");
    const [event] = roundTrip(text);
    expect(event.timezone).toBe("Europe/Vienna");
    expect(event.recurrenceRule).toBe("FREQ=WEEKLY;UNTIL=20261231T090000");
    expect(event.exceptions).toEqual(expect.arrayContaining([
      { occurrenceKey: "2026-10-12T07:00:00.000Z", cancelled: true, override: {} },
      expect.objectContaining({
        occurrenceKey: "2026-10-19T07:00:00.000Z",
        cancelled: false,
        override: expect.objectContaining({ title: "Verschoben", startAt: "2026-10-19T09:00:00.000Z", endAt: "2026-10-19T10:00:00.000Z" }),
      }),
    ]));
  });

  it("folds long lines at 75 octets without splitting characters", () => {
    const text = eventToIcs("d@app", { ...base, description: "ä".repeat(200) });
    for (const line of text.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    expect(roundTrip(text)[0].description).toBe("ä".repeat(200));
  });
});
