// Weekday/date header row of the week/day timeline.
import { parseDate } from "../../../date-utils";
import { cn } from "@/lib/utils";

export function WeekDayHeaders({
  days,
  today,
  locale,
  gridTemplateColumns,
  workingDay,
}: {
  days: string[];
  today: string;
  locale: string;
  gridTemplateColumns: string;
  workingDay: (day: string) => boolean;
}) {
  const weekday = new Intl.DateTimeFormat(locale, { weekday: days.length === 1 ? "long" : "short", timeZone: "UTC" });
  return (
    <div className="grid border-b" style={{ gridTemplateColumns }}>
      <div className="border-r border-line-soft" />
      {days.map((day) => (
        <div
          key={day}
          className={cn(
            "border-r border-line-soft px-2.5 pt-2.5 pb-2 last:border-r-0",
            day === today && "bg-brand-soft",
            !workingDay(day) && day !== today && "bg-muted/30",
          )}
        >
          <p className={cn("text-[10px] font-semibold uppercase tracking-[0.12em] text-text-tertiary", day === today && "text-brand-ink")}>
            {weekday.format(parseDate(day))}
          </p>
          <p className={cn("mt-0.5 text-lg leading-6 font-semibold tabular-nums", day === today && "text-brand-ink")}>
            {parseDate(day).getUTCDate()}
          </p>
        </div>
      ))}
    </div>
  );
}
