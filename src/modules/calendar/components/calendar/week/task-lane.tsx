"use client";

// Compact, collapsible row for all-day tasks, deadlines and project spans. Collapsed it
// only shows a count chip per day; expanded it shows the bars. State persists per browser.
import type { DragEvent } from "react";
import type { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight } from "lucide-react";
import { layoutAllDayBars } from "../../../multi-day";
import type { CalendarItem } from "../../../types";
import { cn } from "@/lib/utils";
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip";
import { AllDayBarButton } from "./all-day-bar";
import { useTasksExpanded } from "./use-tasks-expanded";

export function TaskLane({
  days,
  items,
  gridTemplateColumns,
  draggingId,
  selectedId,
  t,
  onSelect,
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
  onDragStart: (event: DragEvent, item: CalendarItem) => void;
  onDragEnd: () => void;
  onDropDay: (event: DragEvent, day: string) => void;
}) {
  const [expanded, setExpanded] = useTasksExpanded();
  const bars = layoutAllDayBars(items, days);
  if (bars.length === 0) return null;
  const laneCount = bars.reduce((max, bar) => Math.max(max, bar.lane + 1), 0);
  const countsByDay = days.map((_, column) => {
    const covering = bars.filter((bar) => bar.startColumn <= column && bar.endColumn > column);
    const projects = covering.filter((bar) => bar.item.kind === "project").length;
    return { tasks: covering.length - projects, projects };
  });
  const rows = expanded ? laneCount : 1;
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <div className={cn("border-b", expanded && "max-h-[30vh] overflow-y-auto overscroll-contain")}>
      <div className="grid bg-muted/[0.1] py-0.5" style={{ gridTemplateColumns, gridTemplateRows: `repeat(${rows}, auto)` }}>
        <ShortcutTooltip label={t(expanded ? "weekTasksCollapse" : "weekTasksExpand")} hint={t("hintTaskLane")} side="right">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
            className="flex items-start justify-center border-r px-0.5 py-1.5 text-[8px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            style={{ gridColumn: 1, gridRow: "1 / -1" }}
          >
            <span className="flex flex-col items-center gap-0.5">
              <Chevron className="size-3" aria-hidden />
              {t("weekTasksLabel")}
            </span>
          </button>
        </ShortcutTooltip>
        {days.map((day, column) => (
          <div
            key={day}
            className={cn("min-h-7", column < days.length - 1 && "border-r")}
            style={{ gridColumn: column + 2, gridRow: "1 / -1" }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => onDropDay(event, day)}
          />
        ))}
        {expanded
          ? bars.map((bar) => (
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
            ))
          : days.map((day, column) => {
              const { tasks, projects } = countsByDay[column];
              if (tasks + projects === 0) return null;
              return (
                <button
                  type="button"
                  key={`count-${day}`}
                  aria-expanded={false}
                  onClick={() => setExpanded(true)}
                  className="z-10 mx-1 my-0.5 flex min-w-0 items-center gap-1 justify-self-start truncate rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground outline-none hover:bg-muted/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  style={{ gridColumn: column + 2, gridRow: 1 }}
                >
                  {tasks > 0 && <span className="truncate">{t("weekTasksCount", { count: tasks })}</span>}
                  {tasks > 0 && projects > 0 && <span aria-hidden>·</span>}
                  {projects > 0 && <span className="truncate">{t("weekProjectsCount", { count: projects })}</span>}
                </button>
              );
            })}
      </div>
    </div>
  );
}
