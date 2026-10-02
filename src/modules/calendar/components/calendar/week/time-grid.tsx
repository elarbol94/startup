"use client";

// Hourly timeline of the week/day view: hour labels, day columns with non-working
// shading, timed events, the now-line and the drag-to-create preview.
import type { DragEvent } from "react";
import type { useTranslations } from "next-intl";
import { dateAndMinutesInZone } from "../../../date-utils";
import { layoutEventColumns } from "../../../event-layout";
import { timedDaySegment } from "../../../event-time";
import type { CalendarItem } from "../../../types";
import { TimelineEvent } from "../../timeline-event";
import { cn } from "@/lib/utils";
import { NowLine } from "./now-line";
import { useDragCreate } from "./use-drag-create";
import { HOURS, HOUR_HEIGHT, formatMinutes } from "./week-utils";

const STRIPES =
  "repeating-linear-gradient(135deg, color-mix(in srgb, var(--foreground) 5%, transparent) 0 1px, transparent 1px 7px)";

export function TimeGrid({
  days,
  today,
  items,
  timezone,
  workRange,
  workingDay,
  gridTemplateColumns,
  now,
  selectedId,
  t,
  onSelect,
  onCommit,
  onEdit,
  onDropTime,
  onCreateRange,
  onBackgroundClick,
}: {
  days: string[];
  today: string;
  items: CalendarItem[];
  timezone: string;
  workRange: { start: number; end: number };
  workingDay: (day: string) => boolean;
  gridTemplateColumns: string;
  now: number | null;
  selectedId: string | null;
  t: ReturnType<typeof useTranslations<"calendar">>;
  onSelect: (item: CalendarItem) => void;
  onCommit: (item: CalendarItem, startAt: string, endAt: string) => Promise<boolean>;
  onEdit: (item: CalendarItem) => void;
  onDropTime: (event: DragEvent, day: string, hour: number) => void;
  onCreateRange: (day: string, startMinutes: number, endMinutes: number, anchor: DOMRect) => void;
  onBackgroundClick: () => void;
}) {
  const { preview, handlersFor } = useDragCreate({ hasSelection: selectedId !== null, onCreateRange, onBackgroundClick });
  const nowLocal = now === null ? null : dateAndMinutesInZone(new Date(now), timezone);
  const nowVisible = nowLocal !== null && days.includes(nowLocal.date);
  const detailed = days.length === 1;

  const segmentsByDay = new Map(
    days.map((day) => [
      day,
      items.flatMap((item) => {
        if (item.allDay) return [];
        const segment = timedDaySegment(item.startAt, item.endAt, day, timezone);
        return segment ? [{ item, segment }] : [];
      }),
    ]),
  );
  const placementsByDay = new Map(
    days.map((day) => [
      day,
      layoutEventColumns(
        (segmentsByDay.get(day) ?? []).map(({ item, segment }) => ({
          id: item.id,
          start: segment.start,
          end: Math.max(segment.end, segment.start + 24),
        })),
      ),
    ]),
  );

  return (
    <div className="relative grid" style={{ gridTemplateColumns }}>
      <div className="border-r">
        {HOURS.map((hour) => (
          <div key={hour} className="border-b pr-2 text-right" style={{ height: HOUR_HEIGHT }}>
            <span className="-translate-y-2.5 inline-block font-mono text-[10px] text-muted-foreground">
              {formatMinutes(hour * 60)}
            </span>
          </div>
        ))}
      </div>
      {days.map((day) => {
        const working = workingDay(day);
        const dayPreview = preview?.day === day ? preview : null;
        return (
          <div
            key={day}
            data-calendar-day={day}
            className={cn("relative border-r last:border-r-0", day === today && "bg-[#6D5EF7]/[0.025]")}
            {...handlersFor(day)}
          >
            {working ? (
              <>
                <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 bg-muted/45" style={{ height: workRange.start }} />
                <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 bg-muted/45" style={{ top: workRange.end }} />
              </>
            ) : (
              <div aria-hidden className="pointer-events-none absolute inset-0 bg-muted/35" style={{ backgroundImage: STRIPES }} />
            )}
            {HOURS.map((hour) => (
              <button
                type="button"
                key={hour}
                data-slot-hour={hour}
                className="relative block w-full border-b text-left outline-none hover:bg-muted/30 focus-visible:bg-muted/40"
                style={{ height: HOUR_HEIGHT }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  onDropTime(event, day, hour + Math.min(3, Math.floor((event.clientY - rect.top) / 15)) / 4);
                }}
                aria-label={`${day} ${formatMinutes(hour * 60)}`}
              />
            ))}
            {(segmentsByDay.get(day) ?? []).map(({ item }) => {
              const placement = placementsByDay.get(day)!.get(item.id)!;
              const past = now !== null && item.endAt !== null && new Date(item.endAt).getTime() <= now;
              return (
                <TimelineEvent
                  key={`${item.id}:${item.updatedAt}`}
                  item={item}
                  day={day}
                  timezone={timezone}
                  column={placement.column}
                  columns={placement.columns}
                  selected={selectedId === item.id}
                  past={past}
                  detailed={detailed}
                  onSelect={onSelect}
                  onEdit={onEdit}
                  onCommit={onCommit}
                />
              );
            })}
            {dayPreview && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0.5 z-40 overflow-hidden rounded-md border border-primary/60 bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-foreground shadow-sm"
                style={{ top: dayPreview.start, height: dayPreview.end - dayPreview.start }}
              >
                {formatMinutes(dayPreview.start)}–{formatMinutes(dayPreview.end)}
              </div>
            )}
            {nowVisible && <NowLine minutes={nowLocal.minutes} isToday={nowLocal.date === day} />}
          </div>
        );
      })}
      {preview && (
        <output className="sr-only" aria-live="polite">
          {t("weekNewRange", { start: formatMinutes(preview.start), end: formatMinutes(preview.end) })}
        </output>
      )}
    </div>
  );
}
