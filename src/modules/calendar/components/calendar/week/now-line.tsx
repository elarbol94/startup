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
        isToday ? "border-t-[1.5px] border-late" : "border-late/25",
      )}
      style={{ top: minutes }}
    >
      {isToday && <span className="absolute -left-[4.5px] -top-[5px] size-[8px] rounded-full bg-late" />}
    </div>
  );
}
