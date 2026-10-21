import { isValidDate, localDateInZone } from "./date-utils";
import type { CalendarItem } from "./types";

/** Calendar page parameter that opens one item's inspector (see calendar/page.tsx). */
export const CALENDAR_ITEM_PARAM = "item";

/**
 * The link to share for a calendar item. Events open the calendar on their day with the item
 * selected; the view is left out so phones still get their agenda. Tasks, deadlines and
 * projects share their own page when they have one.
 */
export function calendarItemShareHref(
  item: Pick<CalendarItem, "id" | "kind" | "href" | "startDate" | "startAt">,
  timezone: string,
): string {
  if (item.kind !== "event" && item.kind !== "focus" && item.href) return item.href;
  const params = new URLSearchParams();
  const date = item.startDate && isValidDate(item.startDate)
    ? item.startDate
    : item.startAt
      ? localDateInZone(new Date(item.startAt), timezone)
      : null;
  if (date) params.set("date", date);
  params.set(CALENDAR_ITEM_PARAM, item.id);
  return `/calendar?${params.toString()}`;
}
