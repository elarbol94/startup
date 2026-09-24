"use client";

// Agenda (day-grouped list) view of calendar items.
// Used by calendar-client.tsx.
import { useTranslations } from "next-intl";
import { CalendarDays } from "lucide-react";
import { timedDaySegment } from "../../event-time";
import { parseDate } from "../../date-utils";
import type { CalendarItem } from "../../types";
import { CalendarItemPeople } from "./calendar-item-people";
import { SourceIcon } from "./source-icon";

export function AgendaView({
  days,
  items,
  locale,
  timezone,
  t,
  onSelect,
}: {
  days: string[];
  items: CalendarItem[];
  locale: string;
  timezone: string;
  t: ReturnType<typeof useTranslations<"calendar">>;
  onSelect: (item: CalendarItem) => void;
}) {
  const groups = days
    .map((day) => ({
      day,
      items: items.filter((item) =>
        item.allDay
          ? Boolean(item.startDate && item.endDate && item.startDate <= day && item.endDate > day)
          : Boolean(timedDaySegment(item.startAt, item.endAt, day, timezone)),
      ),
    }))
    .filter((group) => group.items.length > 0);
  if (groups.length === 0) {
    return (
      <div className="grid min-h-[32rem] place-items-center p-8 text-center">
        <div>
          <CalendarDays className="mx-auto size-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">{t("empty")}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="divide-y">
      {groups.map((group) => (
        <section
          key={group.day}
          className="grid gap-3 p-4 sm:grid-cols-[8rem_minmax(0,1fr)]"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {new Intl.DateTimeFormat(locale, {
                weekday: "long",
                timeZone: "UTC",
              }).format(parseDate(group.day))}
            </p>
            <p className="mt-1 text-lg font-semibold">
              {new Intl.DateTimeFormat(locale, {
                month: "short",
                day: "numeric",
                timeZone: "UTC",
              }).format(parseDate(group.day))}
            </p>
          </div>
          <div className="space-y-2">
            {group.items.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => onSelect(item)}
                className="flex w-full items-center gap-3 rounded-xl border bg-background p-3 text-left hover:bg-muted/35"
              >
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-white"
                  style={{ backgroundColor: item.color }}
                >
                  <SourceIcon kind={item.kind} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {item.title}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {item.allDay
                      ? t("allDay")
                      : new Intl.DateTimeFormat(locale, {
                          timeStyle: "short",
                          timeZone: timezone,
                        }).format(new Date(item.startAt!))}
                    {item.location ? ` · ${item.location}` : ""}
                  </span>
                  <CalendarItemPeople item={item} />
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
