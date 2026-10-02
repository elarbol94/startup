"use client";

// Month grid view of calendar items: multi-day items as spanning bars per week,
// long-running spans collapsed into a "Laufend" line, capped per-day entries.
// Used by calendar-client.tsx; layout logic lives in ./month/month-layout.ts.
import { useMemo, useState, type DragEvent } from "react";
import { useTranslations } from "next-intl";
import { parseDate } from "../../date-utils";
import type { CalendarItem } from "../../types";
import { cn } from "@/lib/utils";
import { layoutMonthWeek, weekRows } from "./month/month-layout";
import { MonthWeekRow } from "./month/month-week-row";

export function MonthView({
  days,
  date,
  today,
  items,
  locale,
  timezone,
  t,
  selectedId,
  onSelect,
  onNew,
  onOpenDay,
  onDrop,
  onDragStart,
  onDragEnd,
}: {
  days: string[];
  date: string;
  today: string;
  items: CalendarItem[];
  locale: string;
  timezone: string;
  t: ReturnType<typeof useTranslations<"calendar">>;
  selectedId: string | null;
  onSelect: (item: CalendarItem) => void;
  onNew: (day: string) => void;
  onOpenDay: (day: string) => void;
  onDrop: (event: DragEvent, day: string) => void;
  onDragStart: (event: DragEvent, item: CalendarItem) => void;
  onDragEnd: () => void;
}) {
  const [expandedWeeks, setExpandedWeeks] = useState<ReadonlySet<string>>(() => new Set());
  const month = parseDate(date).getUTCMonth();
  const weekdayFormat = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }), [locale]);
  const dayFormat = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "full", timeZone: "UTC" }), [locale]);
  const timeFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { timeStyle: "short", timeZone: timezone }),
    [locale, timezone],
  );
  const rows = useMemo(
    () =>
      weekRows(days).map((week) => {
        const collapsed = layoutMonthWeek(items, week, timezone);
        const expanded = expandedWeeks.has(week[0]) && collapsed.ongoing.length > 0;
        return {
          week,
          collapsed,
          expanded,
          layout: expanded ? layoutMonthWeek(items, week, timezone, { expanded: true }) : collapsed,
        };
      }),
    [days, items, timezone, expandedWeeks],
  );

  const toggleWeek = (first: string) =>
    setExpandedWeeks((current) => {
      const next = new Set(current);
      if (next.has(first)) next.delete(first);
      else next.add(first);
      return next;
    });

  return (
    <div className="h-full overflow-x-auto">
      <div className="flex h-full min-h-[44rem] min-w-[52rem] flex-col">
        <div className="grid shrink-0 grid-cols-7 border-b bg-muted/[0.18]">
          {days.slice(0, 7).map((day, index) => (
            <div
              key={day}
              className={cn(
                "px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
                index < 6 && "border-r",
              )}
            >
              {weekdayFormat.format(parseDate(day))}
            </div>
          ))}
        </div>
        {rows.map(({ week, collapsed, expanded, layout }) => (
          <MonthWeekRow
            key={week[0]}
            layout={layout}
            month={month}
            today={today}
            expanded={expanded}
            ongoingCount={collapsed.ongoing.length}
            ongoingTitles={collapsed.ongoing.map((item) => item.title)}
            selectedId={selectedId}
            t={t}
            formatTime={(item) => (item.allDay || !item.startAt ? null : timeFormat.format(new Date(item.startAt)))}
            formatDay={(day) => dayFormat.format(parseDate(day))}
            onToggleExpanded={() => toggleWeek(week[0])}
            onSelect={onSelect}
            onNew={onNew}
            onOpenDay={onOpenDay}
            onDrop={onDrop}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        ))}
      </div>
    </div>
  );
}
