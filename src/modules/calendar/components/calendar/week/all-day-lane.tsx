"use client";

// All-day lane for events and absences: two lanes, then a per-day "+N more" toggle.
import { useState, type DragEvent } from "react";
import type { useTranslations } from "next-intl";
import { layoutAllDayBars } from "../../../multi-day";
import type { CalendarItem } from "../../../types";
import { cn } from "@/lib/utils";
import { AllDayBarButton } from "./all-day-bar";

const ALL_DAY_VISIBLE_LANES = 2;

export function AllDayLane({
  days,
  items,
  gridTemplateColumns,
  draggingId,
  selectedId,
  t,
  onSelect,
  onNew,
  onDragStart,
  onDragEnd,
  onDropDay,
}: {
  days: string[];
  items: CalendarItem[];
  gridTemplateColumns: string;
  draggingId: string | null;
  selectedId: string | null;
  t: ReturnType<typeof useTranslations<"calendar">>;
  onSelect: (item: CalendarItem) => void;
  onNew: (day: string, hour?: number) => void;
  onDragStart: (event: DragEvent, item: CalendarItem) => void;
  onDragEnd: () => void;
  onDropDay: (event: DragEvent, day: string) => void;
}) {
  const bars = layoutAllDayBars(items, days);
  const laneCount = bars.reduce((max, bar) => Math.max(max, bar.lane + 1), 0);
  const [expanded, setExpanded] = useState(false);
  const collapsible = laneCount > ALL_DAY_VISIBLE_LANES;
  const visibleLanes = collapsible && !expanded ? ALL_DAY_VISIBLE_LANES : laneCount;
  const hiddenByDay = days.map((_, column) =>
    bars.filter((bar) => bar.lane >= visibleLanes && bar.startColumn <= column && bar.endColumn > column).length,
  );
  const rows = Math.max(1, visibleLanes + (collapsible ? 1 : 0));

  return (
    <div className={cn("border-b", expanded && "max-h-[40vh] overflow-y-auto overscroll-contain")}>
      <div
        className="grid bg-muted/[0.18] py-0.5"
        style={{ gridTemplateColumns, gridTemplateRows: `repeat(${rows}, auto)` }}
      >
        <div className="border-r px-0.5 py-2 text-[8px] text-muted-foreground" style={{ gridColumn: 1, gridRow: "1 / -1" }}>
          {t("allDay")}
        </div>
        {days.map((day, column) => (
          <div
            key={day}
            className={cn("min-h-9", column < days.length - 1 && "border-r")}
            style={{ gridColumn: column + 2, gridRow: "1 / -1" }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => onDropDay(event, day)}
            onDoubleClick={() => onNew(day)}
            aria-label={t("dragMove", { date: day })}
          />
        ))}
        {bars.filter((bar) => bar.lane < visibleLanes).map((bar) => (
          <AllDayBarButton
            key={bar.item.id}
            bar={bar}
            days={days}
            draggingId={draggingId}
            selected={selectedId === bar.item.id}
            onSelect={onSelect}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDropDay={onDropDay}
          />
        ))}
        {collapsible && !expanded &&
          days.map((day, column) =>
            hiddenByDay[column] > 0 ? (
              <button
                type="button"
                key={`more-${day}`}
                aria-expanded={false}
                onClick={() => setExpanded(true)}
                className="z-10 mx-1 my-0.5 truncate rounded-md px-1.5 py-0.5 text-left text-[10px] font-medium text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                style={{ gridColumn: column + 2, gridRow: rows }}
              >
                {t("moreAllDay", { count: hiddenByDay[column] })}
              </button>
            ) : null,
          )}
        {collapsible && expanded && (
          <button
            type="button"
            aria-expanded
            onClick={() => setExpanded(false)}
            className="z-10 mx-1 my-0.5 justify-self-start rounded-md px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            style={{ gridColumn: "2 / -1", gridRow: rows }}
          >
            {t("showLessAllDay")}
          </button>
        )}
      </div>
    </div>
  );
}
