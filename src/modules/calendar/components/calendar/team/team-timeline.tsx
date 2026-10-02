// Shared track for one day cell: faint hour grid behind absolutely placed content.
import { cn } from "@/lib/utils";
import { percentOf, type Interval } from "./free-busy";

export function TeamTimelineTrack({
  range,
  ticks,
  className,
  children,
}: {
  range: Interval;
  ticks: number[];
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-sm bg-muted/35", className)}>
      {ticks.map((tick) => (
        <span
          key={tick}
          aria-hidden="true"
          className="absolute inset-y-0 w-px bg-border/70"
          style={{ left: `${percentOf({ start: tick, end: tick }, range).left}%` }}
        />
      ))}
      {children}
    </div>
  );
}

export function TeamDayHeader({
  label,
  date,
  isToday,
  range,
  ticks,
}: {
  label: string;
  date: number;
  isToday: boolean;
  range: Interval;
  ticks: number[];
}) {
  return (
    <div className={cn("min-w-0 border-r px-1.5 pt-2 pb-1 last:border-r-0", isToday && "bg-primary/[0.06]")}>
      <p className="flex items-baseline justify-center gap-1.5 text-center">
        <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
        <span
          className={cn(
            "font-mono text-xs",
            isToday && "rounded-full bg-primary px-1.5 font-semibold text-primary-foreground",
          )}
        >
          {date}
        </span>
      </p>
      <div aria-hidden="true" className="relative mt-1 h-3 font-mono text-[9px] text-muted-foreground">
        {ticks.map((tick) => (
          <span
            key={tick}
            className="absolute top-0 -translate-x-1/2 first:translate-x-0"
            style={{ left: `${percentOf({ start: tick, end: tick }, range).left}%` }}
          >
            {String(Math.floor(tick / 60)).padStart(2, "0")}
          </span>
        ))}
      </div>
    </div>
  );
}
