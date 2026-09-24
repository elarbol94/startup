import { TIME_ZONE } from "../../lib/entry-time";

/** 462 → "7:42", -30 → "−0:30". */
export function formatMinutes(minutes: number, signed = false) {
  const sign = minutes < 0 ? "−" : signed && minutes > 0 ? "+" : "";
  const absolute = Math.abs(minutes);
  return `${sign}${Math.floor(absolute / 60)}:${String(absolute % 60).padStart(2, "0")}`;
}

/** HH:MM of an instant in Austrian local time (for inputs and display). */
export function clockInVienna(ms: number) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(ms));
}

export function formatDay(date: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

export function formatElapsed(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function timeHref(params: { week?: string; user?: string | null }) {
  const search = new URLSearchParams();
  if (params.week) search.set("week", params.week);
  if (params.user) search.set("user", params.user);
  const query = search.toString();
  return query ? `/time?${query}` : "/time";
}

export const selectClassName =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";
