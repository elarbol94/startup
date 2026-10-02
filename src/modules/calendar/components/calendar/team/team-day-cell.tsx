// One member × one day: busy blocks on a working-hours mini timeline.
import type { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { CalendarItem } from "../../../types";
import { percentOf, type Interval } from "./free-busy";
import type { TeamMemberDay } from "./team-day";
import { itemTimeRange } from "./team-format";
import { TeamTimelineTrack } from "./team-timeline";

const ABSENCE_STRIPES =
  "repeating-linear-gradient(135deg, color-mix(in srgb, currentColor 22%, transparent) 0 2px, transparent 2px 7px)";

export function TeamDayCell({
  data,
  range,
  ticks,
  isToday,
  selectedId,
  locale,
  timezone,
  t,
  onSelect,
}: {
  data: TeamMemberDay;
  range: Interval;
  ticks: number[];
  isToday: boolean;
  selectedId: string | null;
  locale: string;
  timezone: string;
  t: ReturnType<typeof useTranslations<"calendar">>;
  onSelect: (item: CalendarItem) => void;
}) {
  const selectedRing = (item: CalendarItem) =>
    item.id === selectedId && "ring-2 ring-foreground ring-offset-1 ring-offset-background";
  const absence = data.absences[0];
  return (
    <div className={cn("flex min-w-0 flex-col justify-center gap-1 border-r px-1.5 py-1.5 last:border-r-0", isToday && "bg-primary/[0.06]")}>
      <div className="flex h-3 min-w-0 items-center gap-1">
        <div className="flex min-w-0 flex-1 gap-0.5">
          {data.allDayMarkers.map((item) => (
            <button
              type="button"
              key={item.id}
              title={item.title}
              aria-label={item.title}
              onClick={() => onSelect(item)}
              className={cn("h-1.5 min-w-1.5 flex-1 rounded-full", selectedRing(item))}
              style={{ backgroundColor: item.color }}
            />
          ))}
        </div>
        {data.tasks.length > 0 && (
          <span
            className="shrink-0 rounded bg-muted px-1 text-[9px] leading-3 text-muted-foreground"
            title={data.tasks.map((task) => task.title).join("\n")}
          >
            {t("teamTaskCount", { count: data.tasks.length })}
          </span>
        )}
      </div>
      <TeamTimelineTrack range={range} ticks={ticks} className="h-6">
        {absence ? (
          <button
            type="button"
            onClick={() => onSelect(absence)}
            title={data.absences.map((item) => item.title).join("\n")}
            className={cn(
              "absolute inset-0 flex items-center justify-center truncate px-1 text-[10px] font-medium text-muted-foreground",
              selectedRing(absence),
            )}
            style={{ backgroundImage: ABSENCE_STRIPES }}
          >
            <span className="truncate rounded bg-background/80 px-1">{t("teamAbsent")}</span>
          </button>
        ) : (
          <>
            {data.blocks.map((block) => {
              const { left, width } = percentOf(block, range);
              const label = `${block.item.title} · ${itemTimeRange(block.item, locale, timezone)}${block.free ? ` (${t("teamFreeMarker")})` : ""}`;
              return (
                <button
                  type="button"
                  key={block.item.id}
                  title={label}
                  aria-label={label}
                  onClick={() => onSelect(block.item)}
                  className={cn("absolute min-w-[3px] rounded-[3px] transition-opacity hover:opacity-80", selectedRing(block.item))}
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    top: `${(block.lane / block.lanes) * 100}%`,
                    height: `${100 / block.lanes}%`,
                    ...(block.free
                      ? {
                          border: `1px solid ${block.item.color}`,
                          backgroundImage: `repeating-linear-gradient(135deg, color-mix(in srgb, ${block.item.color} 45%, transparent) 0 2px, transparent 2px 5px)`,
                        }
                      : { backgroundColor: block.item.color }),
                  }}
                />
              );
            })}
            {data.outside.map(({ item, side }) => {
              const label = `${item.title} · ${itemTimeRange(item, locale, timezone)} (${t("teamOutsideHours")})`;
              return (
                <button
                  type="button"
                  key={item.id}
                  title={label}
                  aria-label={label}
                  onClick={() => onSelect(item)}
                  className={cn("absolute top-1/2 size-1.5 -translate-y-1/2 rounded-full", side === "before" ? "left-0.5" : "right-0.5", selectedRing(item))}
                  style={{ backgroundColor: item.color }}
                />
              );
            })}
          </>
        )}
      </TeamTimelineTrack>
    </div>
  );
}
