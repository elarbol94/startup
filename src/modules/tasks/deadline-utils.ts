import { addDays, isValidDate, localDateInZone } from "@/modules/calendar/date-utils";
import { timeZone } from "@/i18n/config";
import type { DeadlineWithContext, TaskOrigin } from "./types";
import type { TaskStatus } from "./types";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

export type DeadlineTiming = {
  deadlineDate: string;
  deadlineAt: string | null;
  status?: TaskStatus;
};

/** The app's calendar day, not the process zone (UTC in Docker) or the browser's. */
export function todayLocal(now = new Date()) {
  return localDateInZone(now, timeZone);
}

export function addLocalDays(date: string, amount: number) {
  return isValidDate(date) ? addDays(date, amount) : date;
}

/** Local midnight of a valid calendar date, for formatting and `setHours`; null otherwise. */
export function localDateValue(date: string) {
  if (!isValidDate(date)) return null;
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function localTimeFromIso(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function localDeadlineToUtc(deadlineDate: string, time: string) {
  if (!DATE_PATTERN.test(deadlineDate) || !TIME_PATTERN.test(time)) return null;
  const date = new Date(`${deadlineDate}T${time}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function isDeadlineOverdue(
  deadline: DeadlineTiming,
  now = new Date(),
) {
  if (deadline.status === "done") return false;
  if (deadline.deadlineAt) {
    const timestamp = new Date(deadline.deadlineAt).getTime();
    return !Number.isNaN(timestamp) && timestamp < now.getTime();
  }
  return deadline.deadlineDate < todayLocal(now);
}

export function deadlineDayState(
  deadline: DeadlineTiming,
  now = new Date(),
): "overdue" | "today" | "tomorrow" | "future" | "done" {
  if (deadline.status === "done") return "done";
  if (isDeadlineOverdue(deadline, now)) return "overdue";
  const today = todayLocal(now);
  if (deadline.deadlineDate === today) return "today";
  if (deadline.deadlineDate === addLocalDays(today, 1)) return "tomorrow";
  return "future";
}

export function compareDeadlineTiming(
  left: Pick<DeadlineTiming, "deadlineDate" | "deadlineAt">,
  right: Pick<DeadlineTiming, "deadlineDate" | "deadlineAt">,
) {
  const dateOrder = left.deadlineDate.localeCompare(right.deadlineDate);
  if (dateOrder !== 0) return dateOrder;
  if (!left.deadlineAt && right.deadlineAt) return -1;
  if (left.deadlineAt && !right.deadlineAt) return 1;
  return (left.deadlineAt ?? "").localeCompare(right.deadlineAt ?? "");
}

/** Both deadline entry points on the overview open the same record and origin. */
export function deadlineEditOptions(deadline: DeadlineWithContext, fallbackLabel: string) {
  let anchor: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(deadline.contextAnchorJson || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) anchor = parsed as Record<string, unknown>;
  } catch { /* Legacy contexts may have no valid anchor. */ }
  const origin: TaskOrigin | undefined = deadline.contextType && deadline.contextRoute ? {
    type: deadline.contextType,
    entityId: deadline.contextEntityId || "",
    route: deadline.contextRoute,
    label: deadline.contextLabel || fallbackLabel,
    anchor,
  } : undefined;
  return { deadline, origin };
}
