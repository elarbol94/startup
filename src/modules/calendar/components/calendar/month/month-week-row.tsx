"use client";

// One week row of the month grid: day cells (drop targets / double-click to create),
// a collapsed "Laufend" line, spanning bars in lanes and capped per-day entries.
// Used by month-view.tsx.
import type { DragEvent, MouseEvent } from "react";
import type { useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import { parseDate } from "../../../date-utils";
import type { CalendarItem } from "../../../types";
import { cn } from "@/lib/utils";
import type { MonthWeekLayout } from "./month-layout";
import { isoWeek } from "./month-layout";
import { MonthBarButton, MonthEntryButton } from "./month-item-button";

const ONGOING_TITLES = 2;
const LANE_HEIGHT = "1.375rem";

export function MonthWeekRow({
  layout,
  month,
  today,
  expanded,
  ongoingCount,
  ongoingTitles,
  selectedId,
  t,
  formatTime,
  formatDay,
  onToggleExpanded,
  onSelect,
  onNew,
  onOpenDay,
  onDrop,
  onDragStart,
  onDragEnd,
}: {
  layout: MonthWeekLayout<CalendarItem>;
  month: number;
  today: string;
  expanded: boolean;
  ongoingCount: number;
  ongoingTitles: string[];
  selectedId: string | null;
  t: ReturnType<typeof useTranslations<"calendar">>;
  formatTime: (item: CalendarItem) => string | null;
  formatDay: (day: string) => string;
  onToggleExpanded: () => void;
  onSelect: (item: CalendarItem) => void;
  onNew: (day: string) => void;
  onOpenDay: (day: string) => void;
  onDrop: (event: DragEvent, day: string) => void;
  onDragStart: (event: DragEvent, item: CalendarItem) => void;
  onDragEnd: () => void;
}) {
  const { days, bars, lanes, cells } = layout;
  const entryRow = lanes + 3;
  const dayAt = (event: { clientX: number; currentTarget: HTMLElement }) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const column = Math.floor(((event.clientX - rect.left) / rect.width) * days.length);
    return days[Math.min(days.length - 1, Math.max(0, column))];
  };
  const handleDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    onNew(dayAt(event));
  };
  const itemProps = { onSelect, onDragStart, onDragEnd };

  return (
    <div
      className="grid min-h-[8.5rem] flex-1 grid-cols-7 border-b last:border-b-0"
      style={{ gridTemplateRows: `auto auto repeat(${lanes}, ${LANE_HEIGHT}) auto minmax(0, 1fr)` }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => onDrop(event, dayAt(event))}
      onDoubleClick={handleDoubleClick}
    >
      {days.map((day, column) => {
        const weekday = parseDate(day).getUTCDay();
        return (
          <div
            key={`bg-${day}`}
            aria-hidden
            className={cn(
              column < days.length - 1 && "border-r",
              (weekday === 0 || weekday === 6) && "bg-muted/[0.22]",
              parseDate(day).getUTCMonth() !== month && "bg-muted/40",
              day === today && "bg-[#6D5EF7]/[0.07] ring-1 ring-inset ring-[#6D5EF7]/45",
            )}
            style={{ gridColumn: column + 1, gridRow: "1 / -1" }}
          />
        );
      })}

      {days.map((day, column) => {
        const outside = parseDate(day).getUTCMonth() !== month;
        return (
          <div key={`head-${day}`} className="z-10 flex items-center gap-1 px-1.5 pt-1" style={{ gridColumn: column + 1, gridRow: 1 }}>
            <button
              type="button"
              onClick={() => onOpenDay(day)}
              aria-label={t("monthOpenDay", { date: formatDay(day) })}
              className={cn(
                "grid size-6 place-items-center rounded-full text-xs font-semibold outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                outside && "font-normal text-muted-foreground/70",
                day === today && "bg-[#6D5EF7] text-white shadow-sm hover:bg-[#6D5EF7]/90",
              )}
            >
              {parseDate(day).getUTCDate()}
            </button>
            {column === 0 && (
              <span className="ml-auto font-mono text-[9px] text-muted-foreground/80">
                {t("calendarWeek", { week: isoWeek(day) })}
              </span>
            )}
          </div>
        );
      })}

      {ongoingCount > 0 && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={expanded ? t("monthOngoingCollapse") : t("monthOngoingExpand")}
          onClick={onToggleExpanded}
          className="z-10 mx-1 flex min-w-0 items-center gap-1 rounded px-1 text-left text-[10px] text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          style={{ gridColumn: "1 / -1", gridRow: 2 }}
        >
          <ChevronRight className={cn("size-3 shrink-0 transition-transform", expanded && "rotate-90")} />
          {expanded ? (
            <span className="truncate">{t("monthOngoingCollapse")}</span>
          ) : (
            <>
              <span className="shrink-0 font-medium">{t("monthOngoingLabel")}</span>
              <span className="min-w-0 truncate">
                {ongoingTitles.slice(0, ONGOING_TITLES).join(" · ")}
                {ongoingCount > ONGOING_TITLES && ` · ${t("monthOngoingMore", { count: ongoingCount - ONGOING_TITLES })}`}
              </span>
            </>
          )}
        </button>
      )}

      {bars.map(({ item, lane, startColumn, endColumn, continuesBefore, continuesAfter }) => (
        <MonthBarButton
          key={item.id}
          item={item}
          continuesBefore={continuesBefore}
          continuesAfter={continuesAfter}
          selected={item.id === selectedId}
          style={{ gridColumn: `${startColumn + 1} / ${endColumn + 1}`, gridRow: lane + 3 }}
          {...itemProps}
        />
      ))}

      {cells.map((cell, column) =>
        cell.entries.length + cell.tasks.length + cell.taskChip + cell.hidden === 0 ? null : (
          <div
            key={`entries-${cell.day}`}
            className="z-10 flex min-w-0 flex-col gap-px px-1 pb-1"
            style={{ gridColumn: column + 1, gridRow: entryRow }}
          >
            {[...cell.entries, ...cell.tasks].map((item) => (
              <MonthEntryButton
                key={item.id}
                item={item}
                time={formatTime(item)}
                selected={item.id === selectedId}
                {...itemProps}
              />
            ))}
            {cell.taskChip > 0 && (
              <button
                type="button"
                onClick={() => onOpenDay(cell.day)}
                className="h-5 self-start rounded-full border bg-background px-2 text-[10px] text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t("monthTaskChip", { count: cell.taskChip })}
              </button>
            )}
            {cell.hidden > 0 && (
              <button
                type="button"
                onClick={() => onOpenDay(cell.day)}
                className="h-5 self-start truncate rounded px-1 text-left text-[10px] font-medium text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t("moreAllDay", { count: cell.hidden })}
              </button>
            )}
          </div>
        ),
      )}
    </div>
  );
}
