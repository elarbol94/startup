// Sorts one member's items for one day into what the free/busy timeline draws.
import { timedDaySegment } from "../../../event-time";
import type { CalendarItem } from "../../../types";
import { assignLanes, clipInterval, type Interval } from "./free-busy";

export type TeamBlock = Interval & {
  item: CalendarItem;
  free: boolean;
  lane: number;
  lanes: number;
};

export type TeamMemberDay = {
  /** All-day busy events (holiday, sick leave, …): the person is away all day. */
  absences: CalendarItem[];
  /** Timed events inside working hours, clipped to it and laned. */
  blocks: TeamBlock[];
  /** Timed events entirely before or after working hours. */
  outside: { item: CalendarItem; side: "before" | "after" }[];
  /** Other all-day entries (free events, deadlines, milestones, projects). */
  allDayMarkers: CalendarItem[];
  /** Tasks are not busy time; they are only counted. */
  tasks: CalendarItem[];
  /** Busy minutes inside working hours, for the "all free" row. */
  busy: Interval[];
};

/** Same membership rule as before the timeline: assignee or attendee. */
export function belongsTo(item: CalendarItem, memberId: string) {
  return item.assigneeId === memberId || item.attendeeIds.includes(memberId);
}

function isBlockingKind(item: CalendarItem) {
  return item.kind === "event" || item.kind === "focus";
}

export function onAllDay(item: CalendarItem, day: string) {
  return Boolean(item.startDate && item.endDate && item.startDate <= day && item.endDate > day);
}

export function memberDay(
  items: CalendarItem[],
  memberId: string,
  day: string,
  timezone: string,
  range: Interval,
): TeamMemberDay {
  const result: TeamMemberDay = {
    absences: [],
    blocks: [],
    outside: [],
    allDayMarkers: [],
    tasks: [],
    busy: [],
  };
  const timed: (Interval & { item: CalendarItem; free: boolean })[] = [];
  for (const item of items) {
    if (!belongsTo(item, memberId)) continue;
    if (item.allDay) {
      if (!onAllDay(item, day)) continue;
      if (item.kind === "task") result.tasks.push(item);
      else if (isBlockingKind(item) && item.availability === "busy") result.absences.push(item);
      else result.allDayMarkers.push(item);
      continue;
    }
    const segment = timedDaySegment(item.startAt, item.endAt, day, timezone);
    if (!segment) continue;
    if (item.kind === "task") {
      result.tasks.push(item);
      continue;
    }
    const clipped = clipInterval(segment, range);
    if (!clipped) {
      result.outside.push({ item, side: segment.end <= range.start ? "before" : "after" });
      continue;
    }
    const free = !isBlockingKind(item) || item.availability === "free";
    timed.push({ ...clipped, item, free });
    if (!free) result.busy.push(clipped);
  }
  if (result.absences.length > 0) result.busy = [{ ...range }];
  result.blocks = assignLanes(timed).map(({ item, lane, lanes }) => ({ ...item, lane, lanes }));
  return result;
}
