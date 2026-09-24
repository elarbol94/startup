import { dateRange, parseDate } from "@/modules/calendar/date-utils";
import { austrianHolidayOn, type AustrianHoliday } from "./holidays";

/** Days with more net working time than this are flagged (AZG daily limits). */
export const LONG_DAY_MINUTES = 10 * 60;

export type ContractWindow = {
  validFrom: string;
  validTo: string | null;
  weeklyMinutes: number;
  workdaysPerWeek: number;
};

export type MeasuredEntry = {
  workDate: string;
  startedAt: Date;
  endedAt: Date | null;
  breakMinutes: number;
};

export type DaySummary = {
  date: string;
  actualMinutes: number;
  targetMinutes: number;
  holiday: AustrianHoliday | null;
  longDay: boolean;
};

export type PeriodSummary = {
  days: DaySummary[];
  actualMinutes: number;
  targetMinutes: number;
  /** Target up to and including `today`; the basis for the running balance. */
  targetToDateMinutes: number;
  actualToDateMinutes: number;
  balanceMinutes: number;
  hasContract: boolean;
};

export function contractOn(date: string, contracts: ContractWindow[]) {
  let match: ContractWindow | null = null;
  for (const contract of contracts) {
    if (contract.validFrom > date) continue;
    if (contract.validTo && contract.validTo < date) continue;
    if (!match || contract.validFrom > match.validFrom) match = contract;
  }
  return match;
}

/** Monday = 0 … Sunday = 6. */
function weekdayIndex(date: string) {
  return (parseDate(date).getUTCDay() + 6) % 7;
}

export function targetMinutesOn(date: string, contracts: ContractWindow[]) {
  if (austrianHolidayOn(date)) return 0;
  const contract = contractOn(date, contracts);
  if (!contract || contract.workdaysPerWeek <= 0) return 0;
  if (weekdayIndex(date) >= contract.workdaysPerWeek) return 0;
  return Math.round(contract.weeklyMinutes / contract.workdaysPerWeek);
}

export function entryGrossMinutes(entry: Pick<MeasuredEntry, "startedAt" | "endedAt">, now: Date) {
  const end = entry.endedAt ?? now;
  return Math.max(0, Math.floor((end.getTime() - entry.startedAt.getTime()) / 60_000));
}

export function entryNetMinutes(entry: Omit<MeasuredEntry, "workDate">, now: Date) {
  return Math.max(0, entryGrossMinutes(entry, now) - entry.breakMinutes);
}

export function summarizePeriod(input: {
  start: string;
  endExclusive: string;
  today: string;
  entries: MeasuredEntry[];
  contracts: ContractWindow[];
  now: Date;
}): PeriodSummary {
  const actualByDate = new Map<string, number>();
  for (const entry of input.entries) {
    actualByDate.set(entry.workDate, (actualByDate.get(entry.workDate) ?? 0) + entryNetMinutes(entry, input.now));
  }
  const days = dateRange(input.start, input.endExclusive, 400).map((date): DaySummary => {
    const actualMinutes = actualByDate.get(date) ?? 0;
    return {
      date,
      actualMinutes,
      targetMinutes: targetMinutesOn(date, input.contracts),
      holiday: austrianHolidayOn(date),
      longDay: actualMinutes > LONG_DAY_MINUTES,
    };
  });
  const sum = (items: DaySummary[], key: "actualMinutes" | "targetMinutes") =>
    items.reduce((total, day) => total + day[key], 0);
  const toDate = days.filter((day) => day.date <= input.today);
  const actualToDateMinutes = sum(toDate, "actualMinutes");
  const targetToDateMinutes = sum(toDate, "targetMinutes");
  return {
    days,
    actualMinutes: sum(days, "actualMinutes"),
    targetMinutes: sum(days, "targetMinutes"),
    actualToDateMinutes,
    targetToDateMinutes,
    balanceMinutes: actualToDateMinutes - targetToDateMinutes,
    hasContract: input.contracts.length > 0,
  };
}
