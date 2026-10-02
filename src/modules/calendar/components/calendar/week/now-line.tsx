// Current-time marker inside one day column: a red line with a dot on today,
// a faint hairline on the other visible days.
import { cn } from "@/lib/utils";

export function NowLine({ minutes, isToday }: { minutes: number; isToday: boolean }) {
  return (
    <div
      aria-hidden
      data-testid={isToday ? "calendar-now-line" : undefined}
      className={cn(
        "pointer-events-none absolute inset-x-0 z-30 h-0 border-t",
        isToday ? "border-t-2 border-red-500 dark:border-red-400" : "border-red-500/25 dark:border-red-400/25",
      )}
      style={{ top: minutes }}
    >
      {isToday && <span className="absolute -left-[5px] -top-[5px] size-[9px] rounded-full bg-red-500 dark:bg-red-400" />}
    </div>
  );
}
