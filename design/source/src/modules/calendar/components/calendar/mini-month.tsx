"use client";

// Compact month grid for jumping to a date.
// Used by calendar-filters-dialog.tsx.
import { addDays, dateRange, parseDate, startOfWeek } from "../../date-utils";
import { cn } from "@/lib/utils";

export function MiniMonth({
  date,
  today,
  onSelect,
  locale,
}: {
  date: string;
  today: string | null;
  onSelect: (date: string) => void;
  locale: string;
}) {
  const current = parseDate(date);
  const monthStart = `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const gridStart = startOfWeek(monthStart, 1);
  const days = dateRange(gridStart, addDays(gridStart, 42));
  return (
    <div className="w-56 max-w-full">
      <p className="mb-2 text-sm font-semibold">
        {new Intl.DateTimeFormat(locale, {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(current)}
      </p>
      <div className="grid grid-cols-7 text-center text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {Array.from({ length: 7 }, (_, index) =>
          new Intl.DateTimeFormat(locale, {
            weekday: "narrow",
            timeZone: "UTC",
          }).format(parseDate(addDays(gridStart, index))),
        ).map((label, index) => (
          <span key={`${label}-${index}`} className="py-1">
            {label}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px">
        {days.map((day) => {
          const value = parseDate(day);
          const muted = value.getUTCMonth() !== current.getUTCMonth();
          return (
            <button
              type="button"
              key={day}
              onClick={() => onSelect(day)}
              className={cn(
                "grid aspect-square place-items-center rounded-md text-xs outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                muted && "text-muted-foreground/45",
                day === date && "bg-foreground text-background hover:bg-foreground",
                day === today && day !== date && "font-bold text-[#6D5EF7]",
              )}
              aria-label={day}
            >
              {value.getUTCDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
