"use client";

// Month grid view of calendar items.
// Used by calendar-client.tsx.
import { type DragEvent } from "react";
import { useTranslations } from "next-intl";
import { timedDaySegment } from "../../event-time";
import { parseDate } from "../../date-utils";
import type { CalendarItem } from "../../types";
import { cn } from "@/lib/utils";
import { CalendarItemPeople } from "./calendar-item-people";

export function MonthView({
  days,
  date,
  today,
  items,
  locale,
  timezone,
  t,
  onSelect,
  onNew,
  onDrop,
  onDragStart,
  onDragEnd,
}: {
  days: string[];
  date: string;
  today: string | null;
  items: CalendarItem[];
  locale: string;
  timezone: string;
  t: ReturnType<typeof useTranslations<"calendar">>;
  onSelect: (item: CalendarItem) => void;
  onNew: (day: string) => void;
  onDrop: (event: DragEvent, day: string) => void;
  onDragStart: (event: DragEvent, item: CalendarItem) => void;
  onDragEnd: () => void;
}) {
  const month = parseDate(date).getUTCMonth();
  const weekdayLabels = days.slice(0, 7).map((day) =>
    new Intl.DateTimeFormat(locale, {
      weekday: "short",
      timeZone: "UTC",
    }).format(parseDate(day)),
  );
  return (
    <div className="overflow-x-auto">
      <div className="grid min-h-[44rem] min-w-[52rem] grid-cols-7">
      {weekdayLabels.map((label, index) => (
        <div
          key={`${label}-${index}`}
          className={cn(
            "border-b border-r bg-muted/[0.18] px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
            index === 6 && "border-r-0",
          )}
        >
          {label}
        </div>
      ))}
      {days.map((day) => {
        const value = parseDate(day);
        const dayItems = items.filter((item) =>
          item.allDay
            ? Boolean(item.startDate && item.endDate && item.startDate <= day && item.endDate > day)
            : Boolean(timedDaySegment(item.startAt, item.endAt, day, timezone)),
        );
        return (
          <div
            key={day}
            className={cn(
              "min-h-28 border-b border-r p-2 last:border-r-0",
              value.getUTCMonth() !== month && "bg-muted/20 text-muted-foreground",
              day === today && "bg-[#6D5EF7]/[0.08] ring-1 ring-inset ring-[#6D5EF7]/45",
            )}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => onDrop(event, day)}
            onDoubleClick={() => onNew(day)}
          >
            <div className="mb-2 flex items-center justify-between">
              <span
                className={cn(
                  "grid size-6 place-items-center rounded-full text-xs font-semibold",
                  day === today && "bg-[#6D5EF7] text-white shadow-sm",
                )}
              >
                {value.getUTCDate()}
              </span>
              <span className="font-mono text-[9px] text-muted-foreground">
                {t("monthSummary", { count: dayItems.length })}
              </span>
            </div>
            <div className="space-y-1">
              {dayItems.slice(0, 3).map((item) => (
                <button
                  type="button"
                  key={item.id}
                  draggable={item.editable}
                  onDragStart={(event) => onDragStart(event, item)}
                  onDragEnd={onDragEnd}
                  onClick={() => onSelect(item)}
                  className="flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-[10px] hover:bg-muted"
                  style={{
                    boxShadow: `inset 2px 0 0 ${item.color}`,
                  }}
                >
                  {!item.allDay && (
                    <span className="font-mono text-[9px] text-muted-foreground">
                      {new Intl.DateTimeFormat(locale, {
                      timeStyle: "short",
                      timeZone: timezone,
                    }).format(new Date(item.startAt!))}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate">{item.title}</span><CalendarItemPeople item={item} compact />
                </button>
              ))}
              {dayItems.length > 3 && (
                <p className="px-1.5 text-[10px] text-muted-foreground">
                  {t("more", { count: dayItems.length - 3 })}
                </p>
              )}
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}
