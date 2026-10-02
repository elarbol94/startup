"use client";

// Compact month grid for jumping to a date: highlights today, the shown range and busy days.
// Its prev/next arrows only page the mini month itself. Used by the calendar sidebar and
// calendar-filters-dialog.tsx.
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addDays, dateRange, parseDate, startOfWeek } from "../../date-utils";
import { cn } from "@/lib/utils";

function monthStartOf(date: string) {
  return `${date.slice(0, 7)}-01`;
}

function shiftMonth(monthStart: string, amount: number) {
  const value = parseDate(monthStart);
  value.setUTCMonth(value.getUTCMonth() + amount, 1);
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function MiniMonth({
  t,
  date,
  today,
  onSelect,
  locale,
  range,
  busyDays,
  weekStartsOn = 1,
  className,
}: {
  t: ReturnType<typeof useTranslations<"calendar">>;
  date: string;
  today: string | null;
  onSelect: (date: string) => void;
  locale: string;
  /** Currently shown range; `to` is exclusive. */
  range?: { from: string; to: string };
  busyDays?: Set<string>;
  weekStartsOn?: number;
  className?: string;
}) {
  // Visible month is local state; it follows `date` whenever the shown date changes.
  const [shownFor, setShownFor] = useState(date);
  const [monthStart, setMonthStart] = useState(() => monthStartOf(date));
  if (shownFor !== date) {
    setShownFor(date);
    setMonthStart(monthStartOf(date));
  }
  const month = parseDate(monthStart);
  const gridStart = startOfWeek(monthStart, weekStartsOn);
  const days = dateRange(gridStart, addDays(gridStart, 42));
  const dayLabel = new Intl.DateTimeFormat(locale, { dateStyle: "full", timeZone: "UTC" });
  return (
    <div className={cn("w-56 max-w-full", className)}>
      <div className="mb-1 flex items-center justify-between gap-1">
        <p className="truncate pl-1 text-sm font-semibold" aria-live="polite">
          {new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(month)}
        </p>
        <div className="flex shrink-0 items-center">
          <Button size="icon-sm" variant="ghost" aria-label={t("sidebarPreviousMonth")} onClick={() => setMonthStart(shiftMonth(monthStart, -1))}>
            <ChevronLeft />
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label={t("sidebarNextMonth")} onClick={() => setMonthStart(shiftMonth(monthStart, 1))}>
            <ChevronRight />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {Array.from({ length: 7 }, (_, index) =>
          new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "UTC" }).format(parseDate(addDays(gridStart, index))),
        ).map((label, index) => (
          <span key={`${label}-${index}`} className="py-1" aria-hidden>
            {label}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-px">
        {days.map((day, index) => {
          const value = parseDate(day);
          const muted = value.getUTCMonth() !== month.getUTCMonth();
          const inRange = !!range && day >= range.from && day < range.to;
          const rangeStart = inRange && (index % 7 === 0 || day === range.from);
          const rangeEnd = inRange && (index % 7 === 6 || addDays(day, 1) === range.to);
          const selected = day === date;
          const isToday = day === today;
          const busy = busyDays?.has(day) ?? false;
          const label = dayLabel.format(value);
          return (
            <div
              key={day}
              className={cn(
                "p-px",
                inRange && "bg-muted",
                rangeStart && "rounded-l-md",
                rangeEnd && "rounded-r-md",
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(day)}
                aria-label={busy ? t("sidebarDayWithItems", { date: label }) : label}
                aria-current={isToday ? "date" : undefined}
                aria-pressed={selected}
                className={cn(
                  "relative grid aspect-square w-full place-items-center rounded-md text-xs tabular-nums outline-none transition-colors hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring",
                  muted && "text-muted-foreground/45",
                  isToday && !selected && "font-bold text-[#6D5EF7] ring-1 ring-inset ring-[#6D5EF7]/40",
                  selected && "bg-foreground font-semibold text-background hover:bg-foreground",
                )}
              >
                {value.getUTCDate()}
                {busy && (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full",
                      selected ? "bg-background" : "bg-muted-foreground/70",
                    )}
                  />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
