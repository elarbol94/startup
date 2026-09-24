"use client";

// Week view: all-day row plus the hourly timeline with draggable/resizable events.
// Used by calendar-client.tsx.
import { useEffect, useRef, type DragEvent } from "react";
import { useTranslations } from "next-intl";
import { timedDaySegment } from "../../event-time";
import { layoutEventColumns } from "../../event-layout";
import { parseDate } from "../../date-utils";
import type { CalendarItem, CalendarWorkspace } from "../../types";
import { TimelineEvent } from "../timeline-event";
import { cn } from "@/lib/utils";
import { SourceIcon } from "./source-icon";

const HOURS = Array.from({ length: 24 }, (_, index) => index);

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
  const allDayByDate = new Map(
    days.map((day) => [
      day,
      items.filter(
        (item) =>
          item.allDay &&
          item.startDate &&
          item.endDate &&
          item.startDate <= day &&
          item.endDate > day,
      ),
    ]),
  );
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

      <div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] border-b bg-muted/[0.18]">
        <div className="border-r px-0.5 py-2 text-[8px] text-muted-foreground">
          {t("allDay")}
        </div>
        {days.map((day) => (
          <div
            key={day}
            className="min-h-9 border-r p-1 last:border-r-0"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => onDropDay(event, day)}
            onDoubleClick={() => onNew(day)}
            aria-label={t("dragMove", { date: day })}
          >
            <div className="max-h-16 space-y-1 overflow-y-auto">
              {(allDayByDate.get(day) ?? []).map((item) => (
                <button
                  type="button"
                  draggable={item.editable}
                  key={item.id}
                  onDragStart={(event) => onDragStart(event, item)}
                  onDragEnd={onDragEnd}
                  onClick={() => onSelect(item)}
                  className={cn(
                    "group flex w-full items-center gap-1.5 rounded-md border-l-[3px] bg-background px-1.5 py-1 text-left text-[10px] shadow-sm outline-none hover:ring-1 hover:ring-foreground/15 focus-visible:ring-2 focus-visible:ring-ring",
                    draggingId === item.id && "opacity-45",
                  )}
                  style={{ borderLeftColor: item.color }}
                  title={item.title}
                >
                  <SourceIcon kind={item.kind} />
                  <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
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
