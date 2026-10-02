// Pure helpers for the week/day timeline (FlowWeek and its pieces).
import { parseDate } from "../../../date-utils";
import type { CalendarItem, CalendarPreferencesValue } from "../../../types";

export const HOURS = Array.from({ length: 24 }, (_, index) => index);
/** One pixel per minute: every hour row is 60px tall. */
export const HOUR_HEIGHT = 60;
export const SNAP_MINUTES = 15;
export const DEFAULT_CREATE_MINUTES = 60;
export const TASKS_EXPANDED_STORAGE_KEY = "calendar:week-tasks-expanded";

export function formatMinutes(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** "08:30" -> 510; invalid input falls back to the given minutes. */
export function parseClock(value: string, fallback = 0) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return fallback;
  return Math.min(1440, Number(match[1]) * 60 + Number(match[2]));
}

/**
 * Working days are stored as JS weekday numbers (0 = Sunday … 6 = Saturday, the
 * preference action validates 0–6, default [1–5]). ISO 7 is accepted for Sunday too.
 */
export function isWorkingDay(day: string, workingDays: number[]) {
  const weekday = parseDate(day).getUTCDay();
  return workingDays.includes(weekday) || (weekday === 0 && workingDays.includes(7));
}

export function workingRange(preferences: Pick<CalendarPreferencesValue, "workingDayStart" | "workingDayEnd">) {
  const start = parseClock(preferences.workingDayStart, 8 * 60);
  const end = parseClock(preferences.workingDayEnd, 17 * 60);
  return end > start ? { start, end } : { start, end: 1440 };
}

/** Tasks, deadlines, milestones and project spans go to the compact tasks row. */
export function isTaskLaneKind(kind: CalendarItem["kind"]) {
  return kind === "task" || kind === "deadline" || kind === "milestone" || kind === "project";
}

/** Where the timeline scrolls to: a bit before now on today, else just before work starts. */
export function scrollTargetMinutes(workStart: number, nowMinutes: number | null) {
  if (nowMinutes !== null) return Math.max(0, nowMinutes - 90);
  return Math.max(0, workStart - 30);
}

export function snapMinutes(minutes: number) {
  return Math.min(1440 - SNAP_MINUTES, Math.max(0, Math.floor(minutes / SNAP_MINUTES) * SNAP_MINUTES));
}

/**
 * Self-contained script run right after the scroll container is parsed, so the
 * server-rendered timeline is already scrolled before first paint. Mirrors
 * `scrollTargetMinutes` (now is resolved in the user's timezone on the client).
 */
export function initialScrollScript(scrollKey: string, days: string[], timezone: string, workStart: number) {
  const args = JSON.stringify([scrollKey, days, timezone, workStart]).replace(/</g, "\\u003c");
  return `(function(a){try{var el=document.querySelector('[data-week-scroll-key="'+a[0]+'"]');if(!el)return;var target=Math.max(0,a[3]-30);try{var p=new Intl.DateTimeFormat("en-US",{timeZone:a[2],hourCycle:"h23",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).formatToParts(new Date());var g=function(k){for(var i=0;i<p.length;i++)if(p[i].type===k)return p[i].value;return"0"};var d=g("year")+"-"+g("month")+"-"+g("day");if(a[1].indexOf(d)>=0)target=Math.max(0,(Number(g("hour"))%24)*60+Number(g("minute"))-90)}catch(e){}el.scrollTop=target;el.__weekScrollKey=a[0]}catch(e){}})(${args})`;
}
