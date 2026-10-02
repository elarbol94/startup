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
      <div className="border-r" />
      {days.map((day) => (
        <div
          key={day}
          className={cn(
            "border-r p-2.5 last:border-r-0",
            day === today && "bg-[#6D5EF7]/[0.035]",
            !workingDay(day) && day !== today && "bg-muted/30",
          )}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {weekday.format(parseDate(day))}
          </p>
          <p className={cn("mt-0.5 text-lg font-semibold", day === today && "text-[#6D5EF7]")}>
            {parseDate(day).getUTCDate()}
          </p>
        </div>
      ))}
    </div>
  );
}
