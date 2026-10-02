"use client";

// One day of the agenda: sticky header, all-day strip, timed rows with a "now" divider,
// and collapsed task/ongoing groups. Used by agenda-view.tsx.
import { Fragment, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgendaGroup } from "../../../multi-day";
import type { CalendarItem } from "../../../types";
import { AgendaCompactRow, AgendaTimedRow, type AgendaT } from "./agenda-rows";
import { dayRelation, formatDayHeading, hasEnded, nowDividerIndex, splitAgendaDay } from "./agenda-utils";

type DayProps = {
  group: AgendaGroup<CalendarItem>;
  today: string;
  now: number | null;
  locale: string;
  timezone: string;
  t: AgendaT;
  selectedId: string | null;
  onSelect: (item: CalendarItem) => void;
};

function AgendaGroupDetails({ label, titles, children }: { label: string; titles: string; children: ReactNode }) {
  return (
    <details className="group/agenda rounded-lg border border-dashed">
      <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 px-2 text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 shrink-0 transition-transform group-open/agenda:rotate-90" />
        <span className="shrink-0">{label}</span>
        <span className="min-w-0 truncate font-normal group-open/agenda:hidden">{titles}</span>
      </summary>
      <div className="space-y-0.5 px-1 pb-1">{children}</div>
    </details>
  );
}

function NowDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-2 py-0.5" role="separator" aria-label={label}>
      <span className="w-[4.75rem] shrink-0 text-[0.6875rem] font-semibold uppercase tracking-wide text-primary">
        {label}
      </span>
      <span className="size-1.5 shrink-0 rounded-full bg-primary" />
      <span className="h-px flex-1 bg-primary/60" />
    </div>
  );
}

export function AgendaDay({ group, today, now, locale, timezone, t, selectedId, onSelect }: DayProps) {
  const relation = dayRelation(group.day, today);
  const isToday = relation === "today";
  const { allDay, timed, tasks } = splitAgendaDay(group.items);
  const divider = isToday && now !== null && timed.length > 0 ? nowDividerIndex(timed, now) : -1;
  const empty = group.items.length === 0;
  const rowProps = { locale, t, onSelect };

  return (
    <section aria-labelledby={`agenda-${group.day}`}>
      <h3
        id={`agenda-${group.day}`}
        className={cn(
          "sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 px-4 py-2 text-sm font-semibold backdrop-blur supports-[backdrop-filter]:bg-background/80",
          isToday && "text-primary",
        )}
      >
        {isToday && <span className="size-2 rounded-full bg-primary" aria-hidden />}
        {relation && <span>{relation === "today" ? t("today") : t("agendaTomorrow")}</span>}
        {relation && <span className="text-muted-foreground" aria-hidden>·</span>}
        <span className={cn(relation && "font-medium text-foreground/80")}>{formatDayHeading(group.day, locale)}</span>
      </h3>
      <div className={cn("space-y-1 px-2 py-2 sm:px-3", isToday && "bg-primary/[0.03]")}>
        {empty && isToday && (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">{t("agendaNothingToday")}</p>
        )}
        {allDay.length > 0 && (
          <div className="space-y-0.5 rounded-lg bg-muted/40 p-1">
            {allDay.map(({ item, until }) => (
              <AgendaCompactRow
                key={item.id}
                item={item}
                until={until}
                label={t("allDay")}
                selected={item.id === selectedId}
                {...rowProps}
              />
            ))}
          </div>
        )}
        {timed.length > 0 && (
          <div className="space-y-0.5">
            {timed.map(({ item, until }, index) => (
              <Fragment key={item.id}>
                {index === divider && <NowDivider label={t("agendaNow")} />}
                <AgendaTimedRow
                  item={item}
                  until={until}
                  timezone={timezone}
                  selected={item.id === selectedId}
                  past={isToday && hasEnded(item, now)}
                  {...rowProps}
                />
              </Fragment>
            ))}
            {divider === timed.length && <NowDivider label={t("agendaNow")} />}
          </div>
        )}
        {tasks.length > 0 && (
          <AgendaGroupDetails
            label={t("agendaTasks", { count: tasks.length })}
            titles={tasks.map(({ item }) => item.title).join(" · ")}
          >
            {tasks.map(({ item, until }) => (
              <AgendaCompactRow key={item.id} item={item} until={until} selected={item.id === selectedId} {...rowProps} />
            ))}
          </AgendaGroupDetails>
        )}
        {group.ongoing.length > 0 && (
          <AgendaGroupDetails
            label={t("ongoing", { count: group.ongoing.length })}
            titles={group.ongoing.map(({ item }) => item.title).join(" · ")}
          >
            {group.ongoing.map(({ item, until }) => (
              <AgendaCompactRow key={item.id} item={item} until={until} selected={item.id === selectedId} {...rowProps} />
            ))}
          </AgendaGroupDetails>
        )}
      </div>
    </section>
  );
}
