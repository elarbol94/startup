import { describe, expect, it } from "vitest";
import { parseIcsFeed } from "./ics-feed";
import { expandEventOccurrences } from "./recurrence";

const ics = (...events: string[]) =>
  [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Google Inc//Google Calendar 70.9054//EN",
    "X-WR-CALNAME:Arbeit",
    "X-WR-TIMEZONE:Europe/Vienna",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");

const parse = (text: string, options: Partial<Parameters<typeof parseIcsFeed>[1]> = {}) =>
  parseIcsFeed(text, { fallbackTimezone: "Europe/Berlin", ...options });

describe("parseIcsFeed", () => {
  it("reads every event of a Google Calendar export", () => {
    const feed = parse(
      ics(
        "BEGIN:VEVENT",
        "DTSTART;TZID=Europe/Vienna:20261005T090000",
        "DTEND;TZID=Europe/Vienna:20261005T103000",
        "UID:a@google.com",
        "SUMMARY:Förder\\, Termin",
        "DESCRIPTION:Zeile 1\\nZeile 2",
        "LOCATION:Graz",
        "BEGIN:VALARM",
        "DESCRIPTION:Alarm",
        "TRIGGER:-P0DT0H10M0S",
        "END:VALARM",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "DTSTART;VALUE=DATE:20261010",
        "DTEND;VALUE=DATE:20261012",
        "UID:b@google.com",
        "SUMMARY:Urlaub",
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
      ),
    );
    expect(feed.name).toBe("Arbeit");
    expect(feed.timezone).toBe("Europe/Vienna");
    expect(feed.events).toHaveLength(2);
    expect(feed.events[0]).toMatchObject({
      uid: "a@google.com",
      title: "Förder, Termin",
      description: "Zeile 1\nZeile 2",
      location: "Graz",
      allDay: false,
      timezone: "Europe/Vienna",
      availability: "busy",
      recurrenceRule: null,
    });
    expect(feed.events[0].startAt?.toISOString()).toBe("2026-10-05T07:00:00.000Z");
    expect(feed.events[0].endAt?.toISOString()).toBe("2026-10-05T08:30:00.000Z");
    expect(feed.events[1]).toMatchObject({
      allDay: true,
      startDate: "2026-10-10",
      endDate: "2026-10-12",
      availability: "free",
    });
  });

  it("unfolds long lines and keeps quoted parameter colons out of the value", () => {
    const feed = parse(
      ics(
        "BEGIN:VEVENT",
        "UID:c",
        "DTSTART:20261005T090000Z",
        "DURATION:PT45M",
        'ATTENDEE;CN="Doe: Jane";ROLE=REQ-PARTICIPANT:mailto:jane@example.org',
        "SUMMARY:A very long title that Google folds",
        "  across two lines",
        "END:VEVENT",
      ),
    );
    expect(feed.events[0].title).toBe("A very long title that Google folds across two lines");
    expect(feed.events[0].endAt?.toISOString()).toBe("2026-10-05T09:45:00.000Z");
    // A UTC single event is shown in the feed's zone.
    expect(feed.events[0].timezone).toBe("Europe/Vienna");
  });

  it("maps a series with moved and cancelled occurrences onto app exceptions", () => {
    const feed = parse(
      ics(
        "BEGIN:VEVENT",
        "DTSTART;TZID=Europe/Vienna:20261005T090000",
        "DTEND;TZID=Europe/Vienna:20261005T093000",
        "RRULE:FREQ=WEEKLY;UNTIL=20261102T075959Z;BYDAY=MO",
        "EXDATE;TZID=Europe/Vienna:20261012T090000",
        "UID:series",
        "SUMMARY:Jour fixe",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "DTSTART;TZID=Europe/Vienna:20261019T140000",
        "DTEND;TZID=Europe/Vienna:20261019T143000",
        "RECURRENCE-ID;TZID=Europe/Vienna:20261019T090000",
        "UID:series",
        "SUMMARY:Jour fixe (verschoben)",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "DTSTART;TZID=Europe/Vienna:20261026T090000",
        "RECURRENCE-ID;TZID=Europe/Vienna:20261026T090000",
        "UID:series",
        "STATUS:CANCELLED",
        "END:VEVENT",
      ),
    );
    expect(feed.events).toHaveLength(1);
    const [series] = feed.events;
    // UNTIL moved onto the Vienna wall clock (07:59:59 UTC in winter time = 08:59:59).
    expect(series.recurrenceRule).toBe("FREQ=WEEKLY;UNTIL=20261102T085959;BYDAY=MO");
    const occurrences = expandEventOccurrences(
      { id: "series", address: "", ...series },
      series.exceptions.map((exception) => ({
        occurrenceKey: exception.occurrenceKey,
        cancelled: exception.cancelled,
        overrideJson: JSON.stringify(exception.override),
      })),
      new Date("2026-10-01T00:00:00Z"),
      new Date("2026-11-30T00:00:00Z"),
    );
    expect(occurrences.map((occurrence) => [occurrence.title, occurrence.startAt?.toISOString()])).toEqual([
      ["Jour fixe", "2026-10-05T07:00:00.000Z"],
      ["Jour fixe (verschoben)", "2026-10-19T12:00:00.000Z"],
      // 26 Oct is cancelled; 2 Nov falls after UNTIL.
    ]);
  });

  it("drops cancelled and long-past single events but keeps series", () => {
    const feed = parse(
      ics(
        "BEGIN:VEVENT",
        "UID:old",
        "DTSTART:20200101T090000Z",
        "DTEND:20200101T100000Z",
        "SUMMARY:Old",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:old-series",
        "DTSTART:20200101T090000Z",
        "RRULE:FREQ=YEARLY",
        "SUMMARY:Birthday",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:cancelled",
        "DTSTART:20261001T090000Z",
        "STATUS:CANCELLED",
        "END:VEVENT",
      ),
      { endsAfter: new Date("2025-10-01T00:00:00Z") },
    );
    expect(feed.events.map((event) => event.uid)).toEqual(["old-series"]);
    expect(feed.events[0].timezone).toBe("UTC");
    expect(feed.skipped).toBe(2);
  });

  it("turns moved occurrences without their series into single events", () => {
    const feed = parse(
      ics(
        "BEGIN:VEVENT",
        "UID:invite",
        "RECURRENCE-ID:20261005T090000Z",
        "DTSTART:20261006T090000Z",
        "DTEND:20261006T100000Z",
        "SUMMARY:Shared instance",
        "END:VEVENT",
      ),
    );
    expect(feed.events).toEqual([
      expect.objectContaining({ uid: "invite#20261005T090000Z", title: "Shared instance", recurrenceRule: null }),
    ]);
  });

  it("ignores sub-daily rules and falls back for floating times and unknown zones", () => {
    const feed = parseIcsFeed(
      [
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:hourly",
        "DTSTART;TZID=W. Europe Standard Time:20261005T090000",
        "RRULE:FREQ=HOURLY",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:floating",
        "DTSTART:20261005T090000",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\n"),
      { fallbackTimezone: "Europe/Berlin" },
    );
    expect(feed.events[0]).toMatchObject({ recurrenceRule: null, timezone: "Europe/Berlin", title: "(No title)" });
    expect(feed.events[1].startAt?.toISOString()).toBe("2026-10-05T07:00:00.000Z");
    expect(feed.events[1].endAt?.toISOString()).toBe("2026-10-05T08:00:00.000Z");
  });

  it("caps the number of events", () => {
    const events = Array.from({ length: 5 }, (_, index) =>
      ["BEGIN:VEVENT", `UID:${index}`, "DTSTART;VALUE=DATE:20261005", "END:VEVENT"].join("\n"),
    );
    const feed = parse(ics(...events), { maxEvents: 3 });
    expect(feed.events).toHaveLength(3);
    expect(feed).toMatchObject({ truncated: true, skipped: 2 });
  });
});
