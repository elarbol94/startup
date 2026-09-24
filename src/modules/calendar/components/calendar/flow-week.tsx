"use client";

// Week view: all-day row plus the hourly timeline with draggable/resizable events.
// Used by calendar-client.tsx.
import { useEffect, useRef, useState, type DragEvent } from "react";
import { useTranslations } from "next-intl";
import { timedDaySegment } from "../../event-time";
import { layoutEventColumns } from "../../event-layout";
import { addDays, parseDate } from "../../date-utils";
import { layoutAllDayBars } from "../../multi-day";
import type { CalendarItem, CalendarWorkspace } from "../../types";
import { TimelineEvent } from "../timeline-event";
import { cn } from "@/lib/utils";
import { SourceIcon } from "./source-icon";

const HOURS = Array.from({ length: 24 }, (_, index) => index);
const ALL_DAY_VISIBLE_LANES = 2;

function formatMinutes(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function FlowWeek({
  days,
  today,
  items,
  draggingId,
  locale,
  t,
  preferences,
  onSelect,
  onCommit,
  onEdit,
  onNew,
  onDragStart,
  onDragEnd,
  onDropDay,
  onDropTime,
}: {
  days: string[];
  today: string | null;
  items: CalendarItem[];
  draggingId: string | null;
  locale: string;
  t: ReturnType<typeof useTranslations<"calendar">>;
  preferences: CalendarWorkspace["preferences"];
  onSelect: (item: CalendarItem) => void;
  onCommit: (item: CalendarItem, startAt: string, endAt: string) => Promise<boolean>;
  onEdit: (item: CalendarItem) => void;
  onNew: (day: string, hour?: number) => void;
  onDragStart: (event: DragEvent, item: CalendarItem) => void;
  onDragEnd: () => void;
  onDropDay: (event: DragEvent, day: string) => void;
  onDropTime: (event: DragEvent, day: string, hour: number) => void;
}) {
  const allDayBars = layoutAllDayBars(items, days);
  const allDayLaneCount = allDayBars.reduce((max, bar) => Math.max(max, bar.lane + 1), 0);
  const [allDayExpanded, setAllDayExpanded] = useState(false);
  const allDayCollapsible = allDayLaneCount > ALL_DAY_VISIBLE_LANES;
  const visibleAllDayLanes = allDayCollapsible && !allDayExpanded ? ALL_DAY_VISIBLE_LANES : allDayLaneCount;
  const hiddenAllDayByDay = days.map((_, column) =>
    allDayBars.filter((bar) => bar.lane >= visibleAllDayLanes && bar.startColumn <= column && bar.endColumn > column).length,
  );
  const allDayRows = Math.max(1, visibleAllDayLanes + (allDayCollapsible ? 1 : 0));
  const timedByDate = new Map(
    days.map((day) => [
      day,
      items.filter(
        (item) =>
          !item.allDay &&
          Boolean(timedDaySegment(item.startAt, item.endAt, day, preferences.timezone)),
      ),
    ]),
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const weekKey = days[0];
  useEffect(() => {
    if (scrollRef.current) {
      const [hour, minute] = preferences.workingDayStart.split(":").map(Number);
      scrollRef.current.scrollTop = Math.max(0, hour * 60 + minute - 30);
    }
  }, [weekKey, preferences.workingDayStart]);
  const columnsByDate = new Map(days.map((day) => [day, layoutEventColumns(
    (timedByDate.get(day) ?? []).map((item) => ({
      id: item.id,
      start: timedDaySegment(item.startAt, item.endAt, day, preferences.timezone)!.start,
      end: Math.max(timedDaySegment(item.startAt, item.endAt, day, preferences.timezone)!.end, timedDaySegment(item.startAt, item.endAt, day, preferences.timezone)!.start + 24),
    })),
  )]));

  return (
    <div ref={scrollRef} data-testid="calendar-week-scroll" className="relative max-h-[calc(100dvh-12rem)] min-h-80 overflow-auto rounded-2xl [overflow-anchor:none]">
      <div className="min-w-[40rem]">
      <div className="sticky top-0 z-30 bg-card">
      <div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] border-b">
        <div className="border-r" />
        {days.map((day) => {
          return (
            <div
              key={day}
              className={cn(
                "border-r p-2.5 last:border-r-0",
                day === today && "bg-[#6D5EF7]/[0.035]",
              )}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {new Intl.DateTimeFormat(locale, {
                      weekday: "short",
                      timeZone: "UTC",
                    }).format(parseDate(day))}
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 text-lg font-semibold",
                      day === today && "text-[#6D5EF7]",
                    )}
                  >
                    {parseDate(day).getUTCDate()}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className={cn("border-b", allDayExpanded && "max-h-[40vh] overflow-y-auto overscroll-contain")}>
      <div
        className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] bg-muted/[0.18] py-0.5"
        style={{ gridTemplateRows: `repeat(${allDayRows}, auto)` }}
      >
        <div className="border-r px-0.5 py-2 text-[8px] text-muted-foreground" style={{ gridColumn: 1, gridRow: "1 / -1" }}>
          {t("allDay")}
        </div>
        {days.map((day, column) => (
          <div
            key={day}
            className={cn("min-h-9", column < days.length - 1 && "border-r")}
            style={{ gridColumn: column + 2, gridRow: "1 / -1" }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => onDropDay(event, day)}
            onDoubleClick={() => onNew(day)}
            aria-label={t("dragMove", { date: day })}
          />
        ))}
        {allDayBars.filter((bar) => bar.lane < visibleAllDayLanes).map(({ item, lane, startColumn, endColumn }) => (
          <button
            type="button"
            draggable={item.editable}
            key={item.id}
            onDragStart={(event) => onDragStart(event, item)}
            onDragEnd={onDragEnd}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const span = endColumn - startColumn;
              const offset = Math.min(span - 1, Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * span)));
              onDropDay(event, days[startColumn + offset]);
            }}
            onClick={() => onSelect(item)}
            className={cn(
              "group z-10 mx-1 my-0.5 flex min-w-0 items-center gap-1.5 rounded-md border-l-[3px] bg-background px-1.5 py-1 text-left text-[10px] shadow-sm outline-none hover:ring-1 hover:ring-foreground/15 focus-visible:ring-2 focus-visible:ring-ring",
              item.startDate! < days[0] && "rounded-l-none",
              item.endDate! > addDays(days[days.length - 1], 1) && "rounded-r-none",
              draggingId === item.id && "opacity-45",
            )}
            style={{ gridColumn: `${startColumn + 2} / ${endColumn + 2}`, gridRow: lane + 1, borderLeftColor: item.color }}
            title={item.title}
          >
            <SourceIcon kind={item.kind} />
            <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
          </button>
        ))}
        {allDayCollapsible && !allDayExpanded &&
          days.map((day, column) =>
            hiddenAllDayByDay[column] > 0 ? (
              <button
                type="button"
                key={`more-${day}`}
                aria-expanded={false}
                onClick={() => setAllDayExpanded(true)}
                className="z-10 mx-1 my-0.5 truncate rounded-md px-1.5 py-0.5 text-left text-[10px] font-medium text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                style={{ gridColumn: column + 2, gridRow: allDayRows }}
              >
                {t("moreAllDay", { count: hiddenAllDayByDay[column] })}
              </button>
            ) : null,
          )}
        {allDayCollapsible && allDayExpanded && (
          <button
            type="button"
            aria-expanded
            onClick={() => setAllDayExpanded(false)}
            className="z-10 mx-1 my-0.5 justify-self-start rounded-md px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            style={{ gridColumn: "2 / -1", gridRow: allDayRows }}
          >
            {t("showLessAllDay")}
          </button>
        )}
      </div>
      </div>

      </div>
      <div className="relative grid grid-cols-[3rem_repeat(7,minmax(0,1fr))]">
        <div className="border-r">
          {HOURS.map((hour) => (
            <div key={hour} className="h-[60px] border-b pr-2 text-right">
              <span className="-translate-y-2.5 inline-block font-mono text-[10px] text-muted-foreground">
                {formatMinutes(hour * 60)}
              </span>
            </div>
          ))}
        </div>
        {days.map((day) => (
          <div
            key={day}
            data-calendar-day={day}
            className={cn(
              "relative border-r last:border-r-0",
              day === today && "bg-[#6D5EF7]/[0.025]",
            )}
          >
            {HOURS.map((hour) => (
              <button
                type="button"
                key={hour}
                className="block h-[60px] w-full border-b text-left outline-none hover:bg-muted/30 focus-visible:bg-muted/40"
                onDoubleClick={() => onNew(day, hour)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => { const rect = event.currentTarget.getBoundingClientRect(); onDropTime(event, day, hour + Math.min(3, Math.floor((event.clientY - rect.top) / 15)) / 4); }}
                aria-label={`${day} ${formatMinutes(hour * 60)}`}
              />
            ))}
            {(timedByDate.get(day) ?? []).map((item) => {
              const placement = columnsByDate.get(day)!.get(item.id)!;
              return <TimelineEvent key={`${item.id}:${item.updatedAt}`} item={item} day={day} timezone={preferences.timezone}
                column={placement.column} columns={placement.columns} onSelect={onSelect} onEdit={onEdit} onCommit={onCommit} />;
            })}
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}
