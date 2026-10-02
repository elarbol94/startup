"use client";

// Week/day view: day headers, all-day and tasks rows, and the hourly timeline with
// draggable/resizable events and drag-to-create. Pieces live in ./week/.
// Used by calendar-client.tsx.
import { useEffect, useRef, type DragEvent } from "react";
import { useTranslations } from "next-intl";
import { localDateInZone, dateAndMinutesInZone } from "../../date-utils";
import type { CalendarItem, CalendarWorkspace } from "../../types";
import { cn } from "@/lib/utils";
import { AllDayLane } from "./week/all-day-lane";
import { TaskLane } from "./week/task-lane";
import { TimeGrid } from "./week/time-grid";
import { useHydrated, useNowMinute } from "./week/use-week-clock";
import { WeekDayHeaders } from "./week/week-day-headers";
import { initialScrollScript, isTaskLaneKind, isWorkingDay, scrollTargetMinutes, workingRange } from "./week/week-utils";

export function FlowWeek({
  days,
  today,
  items,
  draggingId,
  locale,
  t,
  preferences,
  selectedId,
  onSelect,
  onCommit,
  onEdit,
  onNew,
  onDragStart,
  onDragEnd,
  onDropDay,
  onDropTime,
  onCreateRange,
  onBackgroundClick,
}: {
  days: string[];
  today: string;
  items: CalendarItem[];
  draggingId: string | null;
  locale: string;
  t: ReturnType<typeof useTranslations<"calendar">>;
  preferences: CalendarWorkspace["preferences"];
  selectedId: string | null;
  onSelect: (item: CalendarItem) => void;
  onCommit: (item: CalendarItem, startAt: string, endAt: string) => Promise<boolean>;
  onEdit: (item: CalendarItem) => void;
  onNew: (day: string, hour?: number) => void;
  onDragStart: (event: DragEvent, item: CalendarItem) => void;
  onDragEnd: () => void;
  onDropDay: (event: DragEvent, day: string) => void;
  onDropTime: (event: DragEvent, day: string, hour: number) => void;
  onCreateRange: (day: string, startMinutes: number, endMinutes: number, anchor: DOMRect) => void;
  onBackgroundClick: () => void;
}) {
  const now = useNowMinute();
  const hydrated = useHydrated();
  const gridTemplateColumns = `3rem repeat(${days.length}, minmax(0, 1fr))`;
  const workRange = workingRange(preferences);
  const workingDay = (day: string) => isWorkingDay(day, preferences.workingDays);
  const allDayEvents = items.filter((item) => item.allDay && !isTaskLaneKind(item.kind));
  const allDayTasks = items.filter((item) => item.allDay && isTaskLaneKind(item.kind));

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollKey = `${days[0] ?? ""}-${days.length}`;
  const positionedKey = useRef<string | null>(null);
  // Re-scroll when the visible range changes. The inline script covers the first paint and marks
  // the container, so hydration doesn't undo scrolling the person did before it finished. The ref
  // keeps a repeated effect run (Strict Mode) from scrolling again.
  useEffect(() => {
    const element = scrollRef.current as (HTMLDivElement & { __weekScrollKey?: string }) | null;
    if (!element || positionedKey.current === scrollKey) return;
    positionedKey.current = scrollKey;
    if (element.__weekScrollKey === scrollKey) return;
    const current = new Date();
    const visibleToday = days.includes(localDateInZone(current, preferences.timezone));
    const nowMinutes = visibleToday ? dateAndMinutesInZone(current, preferences.timezone).minutes : null;
    element.scrollTop = scrollTargetMinutes(workRange.start, nowMinutes);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on range/timezone changes, not on every render
  }, [scrollKey, preferences.timezone, workRange.start]);

  return (
    <>
      <div
        ref={scrollRef}
        data-testid="calendar-week-scroll"
        data-week-scroll-key={scrollKey}
        className="relative max-h-[calc(100dvh-12rem)] min-h-80 overflow-auto rounded-2xl [overflow-anchor:none]"
      >
        <div className={cn(days.length >= 5 && "min-w-[40rem]")}>
          <div className="sticky top-0 z-30 bg-card">
            <WeekDayHeaders days={days} today={today} locale={locale} gridTemplateColumns={gridTemplateColumns} workingDay={workingDay} />
            <AllDayLane
              days={days}
              items={allDayEvents}
              gridTemplateColumns={gridTemplateColumns}
              draggingId={draggingId}
              selectedId={selectedId}
              t={t}
              onSelect={onSelect}
              onNew={onNew}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDropDay={onDropDay}
            />
            <TaskLane
              days={days}
              items={allDayTasks}
              gridTemplateColumns={gridTemplateColumns}
              draggingId={draggingId}
              selectedId={selectedId}
              t={t}
              onSelect={onSelect}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDropDay={onDropDay}
            />
          </div>
          <TimeGrid
            days={days}
            today={today}
            items={items}
            timezone={preferences.timezone}
            workRange={workRange}
            workingDay={workingDay}
            gridTemplateColumns={gridTemplateColumns}
            now={now}
            selectedId={selectedId}
            t={t}
            onSelect={onSelect}
            onCommit={onCommit}
            onEdit={onEdit}
            onDropTime={onDropTime}
            onCreateRange={onCreateRange}
            onBackgroundClick={onBackgroundClick}
          />
        </div>
      </div>
      {/* Server-rendered only: scrolls the timeline before first paint. Dropped after
          hydration so client-side renders never create a (non-executing) script tag. */}
      {!hydrated && (
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: initialScrollScript(scrollKey, days, preferences.timezone, workRange.start),
          }}
        />
      )}
    </>
  );
}
