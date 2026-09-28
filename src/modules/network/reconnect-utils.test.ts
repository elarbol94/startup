import { describe, expect, it } from "vitest";
import { compareReconnectDue, isReconnectDue, reconnectDueOn } from "./reconnect-utils";

describe("reconnectDueOn", () => {
  it("adds calendar days across month ends, leap days and year boundaries", () => {
    expect(reconnectDueOn("2026-01-31", 30)).toBe("2026-03-02");
    expect(reconnectDueOn("2026-03-31", 30)).toBe("2026-04-30");
    expect(reconnectDueOn("2028-01-30", 30)).toBe("2028-02-29");
    expect(reconnectDueOn("2028-02-29", 365)).toBe("2029-02-28");
    expect(reconnectDueOn("2026-12-15", 30)).toBe("2027-01-14");
    expect(reconnectDueOn("2026-12-31", 7)).toBe("2027-01-07");
    // Across the October DST change in Vienna: still exactly 30 calendar days.
    expect(reconnectDueOn("2026-10-10", 30)).toBe("2026-11-09");
  });

  it("is null without a cadence and due at once without a last contact", () => {
    expect(reconnectDueOn("2026-09-01", null)).toBeNull();
    expect(reconnectDueOn(null, null)).toBeNull();
    expect(reconnectDueOn(null, 90)).toBe("");
  });
});

describe("isReconnectDue", () => {
  const today = "2026-09-28";

  it("is due on the due date itself and afterwards, not before", () => {
    expect(isReconnectDue({ lastContactOn: "2026-06-30", reconnectEveryDays: 90 }, today)).toBe(true);
    expect(isReconnectDue({ lastContactOn: "2026-06-01", reconnectEveryDays: 90 }, today)).toBe(true);
    expect(isReconnectDue({ lastContactOn: "2026-07-01", reconnectEveryDays: 90 }, today)).toBe(false);
  });

  it("treats a cadence without any contact as due and no cadence as never due", () => {
    expect(isReconnectDue({ lastContactOn: null, reconnectEveryDays: 30 }, today)).toBe(true);
    expect(isReconnectDue({ lastContactOn: "2020-01-01", reconnectEveryDays: null }, today)).toBe(false);
    expect(isReconnectDue({ lastContactOn: null, reconnectEveryDays: null }, today)).toBe(false);
  });
});

describe("compareReconnectDue", () => {
  it("orders never contacted first, then by due date, without a cadence last", () => {
    const contacts = [
      { id: "none", lastContactOn: null, reconnectEveryDays: null },
      { id: "late", lastContactOn: "2026-06-01", reconnectEveryDays: 90 },
      { id: "early", lastContactOn: "2026-06-01", reconnectEveryDays: 30 },
      { id: "never", lastContactOn: null, reconnectEveryDays: 180 },
    ];
    expect([...contacts].sort(compareReconnectDue).map((contact) => contact.id)).toEqual(["never", "early", "late", "none"]);
  });

  it("treats equal due dates as a tie", () => {
    expect(compareReconnectDue(
      { lastContactOn: "2026-05-01", reconnectEveryDays: 30 },
      { lastContactOn: "2026-04-01", reconnectEveryDays: 60 },
    )).toBe(0);
  });
});
