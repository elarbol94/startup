import { describe, expect, it } from "vitest";
import { calendarItemShareHref } from "./share-href";

const base = { id: "evt-1:2026-10-21", kind: "event" as const, href: null, startDate: null, startAt: null };

describe("calendarItemShareHref", () => {
  it("opens an all-day event on its day", () => {
    expect(calendarItemShareHref({ ...base, startDate: "2026-10-21" }, "Europe/Vienna")).toBe(
      "/calendar?date=2026-10-21&item=evt-1%3A2026-10-21",
    );
  });

  it("uses the calendar timezone for timed events", () => {
    // 23:30 UTC on the 21st is already the 22nd in Vienna.
    expect(calendarItemShareHref({ ...base, startAt: "2026-10-21T23:30:00.000Z" }, "Europe/Vienna")).toBe(
      "/calendar?date=2026-10-22&item=evt-1%3A2026-10-21",
    );
  });

  it("shares a task's own page", () => {
    expect(calendarItemShareHref({ ...base, id: "task:t1", kind: "task", href: "/projects/p1?task=t1" }, "Europe/Vienna")).toBe(
      "/projects/p1?task=t1",
    );
  });

  it("keeps events in the calendar even when they link a task", () => {
    expect(calendarItemShareHref({ ...base, href: "/projects/p1?task=t1", startDate: "2026-10-21" }, "Europe/Vienna")).toBe(
      "/calendar?date=2026-10-21&item=evt-1%3A2026-10-21",
    );
  });
});
