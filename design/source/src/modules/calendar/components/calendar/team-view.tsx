"use client";

// Team view: one row per member with their items for each day of the week.
// Used by calendar-client.tsx.
import { useTranslations } from "next-intl";
import { UserIdentity } from "@/components/user-identity";
import { timedDaySegment } from "../../event-time";
import { parseDate } from "../../date-utils";
import type { CalendarItem, CalendarWorkspace } from "../../types";
import { CalendarItemPeople } from "./calendar-item-people";

export function TeamView({
  days,
  items,
  members,
  locale,
  timezone,
  t,
  onSelect,
}: {
  days: string[];
  items: CalendarItem[];
  members: CalendarWorkspace["members"];
  locale: string;
  timezone: string;
  t: ReturnType<typeof useTranslations<"calendar">>;
  onSelect: (item: CalendarItem) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[52rem]">
      <div className="grid grid-cols-[12rem_repeat(7,minmax(7rem,1fr))] border-b bg-muted/20">
        <div className="border-r p-3 text-xs font-semibold">{t("people")}</div>
        {days.map((day) => (
          <div key={day} className="border-r p-3 text-center last:border-r-0">
            <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              {new Intl.DateTimeFormat(locale, {
                weekday: "short",
                timeZone: "UTC",
              }).format(parseDate(day))}
            </p>
            <p className="mt-1 font-mono text-xs">{parseDate(day).getUTCDate()}</p>
          </div>
        ))}
      </div>
      {members.map((member) => (
        <div
          key={member.id}
          className="grid min-h-24 grid-cols-[12rem_repeat(7,minmax(7rem,1fr))] border-b"
        >
          <div className="flex items-center gap-2 border-r p-3">
            <UserIdentity userId={member.id} name={member.name} />
          </div>
          {days.map((day) => {
            const personItems = items.filter(
              (item) =>
                (item.assigneeId === member.id ||
                  item.attendeeIds.includes(member.id)) &&
                (item.allDay
                  ? Boolean(
                      item.startDate &&
                        item.endDate &&
                        item.startDate <= day &&
                        item.endDate > day,
                    )
                  : Boolean(timedDaySegment(item.startAt, item.endAt, day, timezone))),
            );
            return (
              <div key={day} className="border-r p-2 last:border-r-0">
                <div className="space-y-1">
                  {personItems.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => onSelect(item)}
                      className="w-full truncate rounded-md border-l-[3px] bg-muted/35 px-2 py-1.5 text-left text-[10px]"
                      style={{ borderLeftColor: item.color }}
                    >
                      <span className="block truncate">{item.title}</span><CalendarItemPeople item={item} compact />
                    </button>
                  ))}
                  {personItems.length === 0 && (
                    <span className="block pt-3 text-center text-[10px] text-muted-foreground/45">
                      —
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
      </div>
    </div>
  );
}
