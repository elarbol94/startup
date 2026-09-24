// Deadline lane of the portfolio Gantt: draggable diamonds for contextual deadlines.
// Used by portfolio-client.tsx.
"use client";

import type { RefObject } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { CalendarClock } from "lucide-react";
import type { PortfolioSchedule } from "@/modules/projects/queries";
import { cn } from "@/lib/utils";
import {
  isDeadlineOverdue,
  localDateValue,
} from "@/modules/tasks/deadline-utils";
import { withWorkItemFocus } from "@/modules/context/routes";
import { DEADLINE_LANE_HEIGHT } from "./portfolio-constants";
import { calendarDistance } from "./portfolio-utils";
import type { useDeadlineDrag } from "./use-deadline-drag";

export function DeadlineLane({
  totalWidth,
  treeWidth,
  timelineWidth,
  effectiveSchedule,
  range,
  renderedRangeEnd,
  renderedAt,
  dayWidth,
  draggedRef,
  startDeadlineDrag,
  moveDeadlineDrag,
  endDeadlineDrag,
  cancelDeadlineDrag,
  handleDeadlineKey,
}: Pick<
  ReturnType<typeof useDeadlineDrag>,
  | "startDeadlineDrag"
  | "moveDeadlineDrag"
  | "endDeadlineDrag"
  | "cancelDeadlineDrag"
  | "handleDeadlineKey"
> & {
  totalWidth: number;
  treeWidth: number;
  timelineWidth: number;
  effectiveSchedule: PortfolioSchedule;
  range: { start: string; end: string };
  renderedRangeEnd: string;
  renderedAt: Date;
  dayWidth: number;
  draggedRef: RefObject<boolean>;
}) {
  const tDeadlines = useTranslations("deadlines");
  const format = useFormatter();
  const router = useRouter();
  return (
      <div
        data-row-kind="deadlines"
        role="treeitem"
        aria-level={1}
        aria-selected={false}
        className="relative z-[2] flex border-b bg-amber-50/15 dark:bg-amber-950/5"
        style={{ width: totalWidth, height: DEADLINE_LANE_HEIGHT }}
      >
        <div
          className="sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r border-l-2 border-l-amber-500 bg-card/95 px-3 font-semibold"
          style={{ width: treeWidth }}
        >
          <CalendarClock className="size-3.5 text-amber-600" />
          <span className="truncate text-xs">{tDeadlines("ganttLane")}</span>
          <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground">{effectiveSchedule.deadlines.length}</span>
        </div>
        <div className="relative" style={{ width: timelineWidth }}>
          {effectiveSchedule.deadlines.map((deadline) => {
            if (!deadline.dueDate || deadline.dueDate < range.start || deadline.dueDate > renderedRangeEnd) return null;
            const overdue = isDeadlineOverdue({
              deadlineDate: deadline.dueDate,
              deadlineAt: deadline.deadlineAt,
              status: deadline.status,
            }, renderedAt);
            const href = withWorkItemFocus(deadline.contextRoute || "/", deadline.id, "deadline");
            const localDate = localDateValue(deadline.dueDate);
            const deadlineLabel = deadline.deadlineAt
              ? format.dateTime(new Date(deadline.deadlineAt), { dateStyle: "medium", timeStyle: "short" })
              : `${localDate ? format.dateTime(localDate, { dateStyle: "medium" }) : deadline.dueDate} · ${tDeadlines("allDay")}`;
            return (
              <button
                key={deadline.id}
                type="button"
                data-deadline-id={deadline.id}
                onClick={() => {
                  if (!draggedRef.current) router.push(href);
                }}
                onPointerDown={(event) => startDeadlineDrag(event, deadline)}
                onPointerMove={moveDeadlineDrag}
                onPointerUp={endDeadlineDrag}
                onPointerCancel={cancelDeadlineDrag}
                onKeyDown={(event) => handleDeadlineKey(event, deadline)}
                className={cn(
                  "absolute top-1/2 grid size-4 -translate-x-1/2 -translate-y-1/2 rotate-45 cursor-ew-resize touch-none place-items-center rounded-[2px] border-2 bg-card shadow-xs transition-transform hover:scale-125 focus-visible:outline-2 focus-visible:outline-ring",
                  deadline.status === "done" && "opacity-45",
                )}
                style={{
                  left: calendarDistance(range.start, deadline.dueDate) * dayWidth + dayWidth / 2,
                  borderColor: deadline.status === "done" ? "#059669" : overdue ? "#dc2626" : "#d97706",
                }}
                title={`${deadline.title} · ${deadlineLabel} · ${deadline.assigneeName || tDeadlines("unassigned")}`}
                aria-label={`${deadline.title}, ${deadlineLabel}`}
              >
                <span className="size-1.5 -rotate-45 rounded-full bg-current" />
              </button>
            );
          })}
        </div>
      </div>
  );
}
