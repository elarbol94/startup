// Deadline lane of the portfolio Gantt: draggable diamonds for contextual deadlines.
// Used by portfolio-client.tsx.
"use client";

import type { RefObject } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { CalendarClock, ChevronDown, ChevronRight, Diamond } from "lucide-react";
import type { PortfolioSchedule } from "@/modules/projects/queries";
import { cn } from "@/lib/utils";
import {
  isDeadlineOverdue,
  localDateValue,
} from "@/modules/tasks/deadline-utils";
import { withWorkItemFocus } from "@/modules/context/routes";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { clusterDeadlineMarkers, DEADLINE_CLUSTER_DISTANCE, sortDeadlinesForRows } from "../deadline-clusters";
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
  deadlinePreview,
  expanded,
  onToggleExpanded,
}: Pick<
  ReturnType<typeof useDeadlineDrag>,
  | "startDeadlineDrag"
  | "moveDeadlineDrag"
  | "endDeadlineDrag"
  | "cancelDeadlineDrag"
  | "handleDeadlineKey"
  | "deadlinePreview"
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
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const t = useTranslations("projects");
  const tDeadlines = useTranslations("deadlines");
  const format = useFormatter();
  const router = useRouter();
  const markerProps = {
    range, dayWidth, renderedAt, draggedRef, startDeadlineDrag, moveDeadlineDrag,
    endDeadlineDrag, cancelDeadlineDrag, handleDeadlineKey,
  };
  return (
    <>
      <div
        data-row-kind="deadlines"
        role="treeitem"
        aria-level={1}
        aria-selected={false}
        aria-expanded={expanded}
        className="relative z-[2] flex border-b bg-amber-50/15 dark:bg-amber-950/5"
        style={{ width: totalWidth, height: DEADLINE_LANE_HEIGHT }}
      >
        <div
          className="sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r border-l-2 border-l-amber-500 bg-card/95 px-3 font-semibold"
          style={{ width: treeWidth }}
        >
          <Button variant="ghost" size="icon-xs" onClick={onToggleExpanded} aria-label={tDeadlines("ganttToggle")}>
            {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </Button>
          <CalendarClock className="size-3.5 text-amber-600" />
          <span className="truncate text-xs">{tDeadlines("ganttLane")}</span>
          <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground">{effectiveSchedule.deadlines.length}</span>
        </div>
        <div className="relative" style={{ width: timelineWidth }}>
          {clusterDeadlineMarkers(
            effectiveSchedule.deadlines.filter((deadline): deadline is typeof deadline & { dueDate: string } => Boolean(deadline.dueDate && deadline.dueDate >= range.start && deadline.dueDate <= renderedRangeEnd)),
            (deadline) => calendarDistance(range.start, deadline.dueDate) * dayWidth + dayWidth / 2,
            // While a diamond is being dragged every marker stays individual so the drag target never merges away.
            deadlinePreview ? 0 : DEADLINE_CLUSTER_DISTANCE,
          ).map((cluster) => {
            if (cluster.items.length > 1) {
              const anyOverdue = cluster.items.some((item) => isDeadlineOverdue({ deadlineDate: item.dueDate, deadlineAt: item.deadlineAt, status: item.status }, renderedAt));
              const allDone = cluster.items.every((item) => item.status === "done");
              return (
                <Popover key={cluster.items.map((item) => item.id).join(":")}>
                  <PopoverTrigger
                    render={
                      <button
                        type="button"
                        data-deadline-cluster={cluster.items.length}
                        className="absolute top-1/2 z-[1] grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center focus-visible:outline-2 focus-visible:outline-ring"
                        style={{ left: cluster.x }}
                        aria-label={t("deadlineCluster", { count: cluster.items.length })}
                        title={cluster.items.map((item) => item.title).join("\n")}
                      />
                    }
                  >
                    <span
                      className={cn("absolute inset-0.5 rotate-45 rounded-[2px] border-2 bg-card shadow-xs", allDone && "opacity-45")}
                      style={{ borderColor: allDone ? "#059669" : anyOverdue ? "#dc2626" : "#d97706" }}
                      aria-hidden
                    />
                    <span
                      className={cn("relative rounded-full px-1 font-mono text-[9px] leading-3.5 font-semibold text-white tabular-nums", allDone ? "bg-emerald-600" : anyOverdue ? "bg-red-600" : "bg-amber-600")}
                    >
                      {cluster.items.length}
                    </span>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-1" align="center">
                    <p className="px-2 pt-1 pb-1.5 text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{t("deadlineCluster", { count: cluster.items.length })}</p>
                    {cluster.items.map((item) => {
                      const itemOverdue = isDeadlineOverdue({ deadlineDate: item.dueDate, deadlineAt: item.deadlineAt, status: item.status }, renderedAt);
                      const itemDate = localDateValue(item.dueDate);
                      const itemLabel = item.deadlineAt
                        ? format.dateTime(new Date(item.deadlineAt), { dateStyle: "medium", timeStyle: "short" })
                        : `${itemDate ? format.dateTime(itemDate, { dateStyle: "medium" }) : item.dueDate} · ${tDeadlines("allDay")}`;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                          onClick={() => router.push(withWorkItemFocus(item.contextRoute || "/", item.id, "deadline"))}
                        >
                          <Diamond className={cn("mt-0.5 size-3.5 shrink-0", item.status === "done" ? "text-emerald-600" : itemOverdue ? "fill-red-500 text-red-600" : "fill-amber-500 text-amber-600")} aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className={cn("block truncate", item.status === "done" && "text-muted-foreground line-through")}>{item.title}</span>
                            <span className={cn("block text-xs", itemOverdue ? "font-medium text-red-700 dark:text-red-400" : "text-muted-foreground")}>
                              {itemLabel}{itemOverdue ? ` · ${t("overdueTag")}` : ""}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </PopoverContent>
                </Popover>
              );
            }
            return <DeadlineMarker key={cluster.items[0].id} deadline={cluster.items[0]} {...markerProps} />;
          })}
        </div>
      </div>
      {expanded && sortDeadlinesForRows(effectiveSchedule.deadlines).map((deadline) => {
        const overdue = Boolean(deadline.dueDate) && isDeadlineOverdue({ deadlineDate: deadline.dueDate ?? "", deadlineAt: deadline.deadlineAt, status: deadline.status }, renderedAt);
        const visible = Boolean(deadline.dueDate && deadline.dueDate >= range.start && deadline.dueDate <= renderedRangeEnd);
        return (
          <div
            key={deadline.id}
            data-row-kind="deadline"
            role="treeitem"
            aria-level={2}
            aria-selected={false}
            className="relative z-[2] flex border-b bg-amber-50/10 dark:bg-amber-950/5"
            style={{ width: totalWidth, height: DEADLINE_LANE_HEIGHT }}
          >
            <div
              className="sticky left-0 z-20 flex shrink-0 items-center border-r border-l-2 border-l-amber-500/50 bg-card/95 pr-3 pl-10"
              style={{ width: treeWidth }}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                onClick={() => router.push(withWorkItemFocus(deadline.contextRoute || "/", deadline.id, "deadline"))}
              >
                <Diamond className={cn("size-3 shrink-0", deadline.status === "done" ? "text-emerald-600" : overdue ? "fill-red-500 text-red-600" : "fill-amber-500 text-amber-600")} aria-hidden />
                <span className={cn("truncate", deadline.status === "done" && "text-muted-foreground line-through")}>{deadline.title}</span>
              </button>
            </div>
            <div className="relative" style={{ width: timelineWidth }}>
              {visible && deadline.dueDate && <DeadlineMarker deadline={{ ...deadline, dueDate: deadline.dueDate }} {...markerProps} />}
            </div>
          </div>
        );
      })}
    </>
  );
}

type Deadline = PortfolioSchedule["deadlines"][number] & { dueDate: string };

function DeadlineMarker({
  deadline,
  range,
  dayWidth,
  renderedAt,
  draggedRef,
  startDeadlineDrag,
  moveDeadlineDrag,
  endDeadlineDrag,
  cancelDeadlineDrag,
  handleDeadlineKey,
}: Pick<
  ReturnType<typeof useDeadlineDrag>,
  "startDeadlineDrag" | "moveDeadlineDrag" | "endDeadlineDrag" | "cancelDeadlineDrag" | "handleDeadlineKey"
> & {
  deadline: Deadline;
  range: { start: string; end: string };
  dayWidth: number;
  renderedAt: Date;
  draggedRef: RefObject<boolean>;
}) {
  const tDeadlines = useTranslations("deadlines");
  const format = useFormatter();
  const router = useRouter();
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
}
