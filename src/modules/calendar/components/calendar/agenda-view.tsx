"use client";

// Agenda (day-grouped list) view of calendar items.
// Used by calendar-client.tsx.
import { useTranslations } from "next-intl";
import { CalendarDays, ChevronRight } from "lucide-react";
import { buildAgendaGroups } from "../../multi-day";
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
  const groups = buildAgendaGroups(items, days, timezone);
  const formatUntil = (day: string) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(parseDate(day));
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
          className="grid grid-cols-[minmax(0,1fr)] gap-3 p-4 sm:grid-cols-[8rem_minmax(0,1fr)]"
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
          <div className="min-w-0 space-y-2">
            {group.items.map(({ item, until }) => (
              <button
                type="button"
                key={item.id}
                onClick={() => onSelect(item)}
                className="flex w-full min-w-0 items-center gap-3 rounded-xl border bg-background p-3 text-left hover:bg-muted/35"
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
                    {until ? ` · ${t("untilDate", { date: formatUntil(until) })}` : ""}
                    {item.location ? ` · ${item.location}` : ""}
                  </span>
                  <CalendarItemPeople item={item} />
                </span>
              </button>
            ))}
            {group.ongoing.length > 0 && (
              <details className="group/ongoing rounded-xl border border-dashed">
                <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="size-3.5 shrink-0 transition-transform group-open/ongoing:rotate-90" />
                  <span className="shrink-0">{t("ongoing", { count: group.ongoing.length })}</span>
                  <span className="min-w-0 truncate font-normal group-open/ongoing:hidden">
                    {group.ongoing.map(({ item }) => item.title).join(" · ")}
                  </span>
                </summary>
                <div className="space-y-1 px-2 pb-2">
                  {group.ongoing.map(({ item, until }) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => onSelect(item)}
                      className="flex w-full min-w-0 items-center gap-2 rounded-lg border-l-[3px] px-2 py-1.5 text-left text-xs hover:bg-muted/35"
                      style={{ borderLeftColor: item.color }}
                    >
                      <SourceIcon kind={item.kind} />
                      <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
                      {until && (
                        <span className="shrink-0 text-muted-foreground">
                          {t("untilDate", { date: formatUntil(until) })}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </details>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
