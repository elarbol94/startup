import { describe, expect, it } from "vitest";
import { contractOn, entryNetMinutes, summarizePeriod, targetMinutesOn, type ContractWindow } from "./balance";

const fullTime: ContractWindow = { validFrom: "2026-01-01", validTo: null, weeklyMinutes: 2310, workdaysPerWeek: 5 };
const partTime: ContractWindow = { validFrom: "2026-06-01", validTo: null, weeklyMinutes: 1200, workdaysPerWeek: 4 };

describe("time balance", () => {
  it("picks the contract period valid on a date", () => {
    expect(contractOn("2025-12-31", [fullTime])).toBeNull();
    expect(contractOn("2026-05-29", [fullTime, partTime])).toBe(fullTime);
    expect(contractOn("2026-06-01", [fullTime, partTime])).toBe(partTime);
  });

  it("derives daily targets from weekly minutes, workdays and holidays", () => {
    expect(targetMinutesOn("2026-05-11", [fullTime])).toBe(462); // Monday
    expect(targetMinutesOn("2026-05-14", [fullTime])).toBe(0); // Ascension
    expect(targetMinutesOn("2026-05-16", [fullTime])).toBe(0); // Saturday
    expect(targetMinutesOn("2026-06-05", [partTime])).toBe(0); // Friday, 4-day week
    expect(targetMinutesOn("2026-06-04", [partTime])).toBe(0); // Corpus Christi
    expect(targetMinutesOn("2026-06-03", [partTime])).toBe(300);
  });

  it("subtracts breaks and measures running timers until now", () => {
    const now = new Date("2026-05-11T12:00:00Z");
    expect(entryNetMinutes({ startedAt: new Date("2026-05-11T06:00:00Z"), endedAt: new Date("2026-05-11T11:00:00Z"), breakMinutes: 30 }, now)).toBe(270);
    expect(entryNetMinutes({ startedAt: new Date("2026-05-11T11:15:00Z"), endedAt: null, breakMinutes: 0 }, now)).toBe(45);
    expect(entryNetMinutes({ startedAt: new Date("2026-05-11T11:15:00Z"), endedAt: null, breakMinutes: 60 }, now)).toBe(0);
  });

  it("summarises a week and only counts the balance up to today", () => {
    const entries = [
      { workDate: "2026-05-11", startedAt: new Date("2026-05-11T06:00:00Z"), endedAt: new Date("2026-05-11T15:00:00Z"), breakMinutes: 30 },
      { workDate: "2026-05-12", startedAt: new Date("2026-05-12T06:00:00Z"), endedAt: new Date("2026-05-12T17:30:00Z"), breakMinutes: 30 },
    ];
    const summary = summarizePeriod({
      start: "2026-05-11",
      endExclusive: "2026-05-18",
      today: "2026-05-12",
      entries,
      contracts: [fullTime],
      now: new Date("2026-05-12T18:00:00Z"),
    });
    expect(summary.days).toHaveLength(7);
    expect(summary.targetMinutes).toBe(4 * 462);
    expect(summary.actualMinutes).toBe(510 + 660);
    expect(summary.targetToDateMinutes).toBe(924);
    expect(summary.balanceMinutes).toBe(1170 - 924);
    expect(summary.days[1].longDay).toBe(true);
    expect(summary.days[3].holiday).toBe("ascension");
  });
});
