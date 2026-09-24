import { describe, expect, it } from "vitest";
import { austrianHolidayOn, austrianHolidays, easterSunday } from "./holidays";

describe("Austrian public holidays", () => {
  it("computes Easter Sunday", () => {
    expect(easterSunday(2025)).toBe("2025-04-20");
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
  });

  it("lists the 13 nationwide holidays including movable feasts", () => {
    const holidays = austrianHolidays(2026);
    expect(holidays.size).toBe(13);
    expect(austrianHolidayOn("2026-04-06")).toBe("easterMonday");
    expect(austrianHolidayOn("2026-05-14")).toBe("ascension");
    expect(austrianHolidayOn("2026-05-25")).toBe("whitMonday");
    expect(austrianHolidayOn("2026-06-04")).toBe("corpusChristi");
    expect(austrianHolidayOn("2026-10-26")).toBe("nationalDay");
    expect(austrianHolidayOn("2026-10-27")).toBeNull();
  });
});
