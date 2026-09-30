// Timeline (right) cell of a portfolio Gantt row: task/summary/milestone/project bars,
// placement presets, resize handles, the dependency connector and overflow markers. Used by gantt-row.tsx.
"use client";

import { UserIdentity } from "@/components/user-identity";

import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PortfolioSchedule } from "@/modules/projects/queries";
import { cn } from "@/lib/utils";
import type { Row, SetState } from "./portfolio-types";
import { barEdgeAt, barEdgeGrabWidth, calendarDistance, ganttBarColors } from "./portfolio-utils";
import type { useBarDrag } from "./use-bar-drag";
import type { useDependencyLinking } from "./use-dependency-linking";
import type { usePortfolioRows } from "./use-portfolio-rows";

export type GanttRowTimelineProps = Pick<
  ReturnType<typeof useBarDrag>,
  | "startDrag"
  | "moveDrag"
  | "endDrag"
  | "cancelTaskDrag"
  | "startUnscheduledDrag"
  | "startProjectDrag"
  | "moveProjectDrag"
  | "endProjectDrag"
  | "cancelProjectDrag"
  | "startProjectPlacement"
  | "handleScheduleResizeKey"
  | "handleTaskScheduleKey"
> &
  Pick<
    ReturnType<typeof useDependencyLinking>,
    | "validDependencyTarget"
    | "startConnectorGesture"
    | "moveConnectorGesture"
    | "endConnectorGesture"
    | "cancelConnectorGesture"
    | "openTaskFromBar"
  > &
  Pick<ReturnType<typeof usePortfolioRows>, "critical"> & {
    row: Row;
    project: PortfolioSchedule["projects"][number];
    range: { start: string; end: string };
    dayWidth: number;
    timelineWidth: number;
    schedule: PortfolioSchedule;
    selectedTaskId: string | null;
    setSelectedTaskId: SetState<string | null>;
    criticalVisible: boolean;
    scheduleCommitPending: boolean;
    dependencyCommitPending: boolean;
    dependencySourceId: string | null;
    setDependencySourceId: SetState<string | null>;
    setDependencyHoverId: SetState<string | null>;
    isDraftTask: (id: string) => boolean;
  };

export function GanttRowTimeline({
  row,
  project,
  range,
  dayWidth,
  critical,
  schedule,
  dependencySourceId,
  validDependencyTarget,
  scheduleCommitPending,
  dependencyCommitPending,
  startDrag,
  startProjectDrag,
  moveDrag,
  moveProjectDrag,
  endDrag,
  endProjectDrag,
  cancelTaskDrag,
  cancelProjectDrag,
  handleScheduleResizeKey,
  isDraftTask,
  startConnectorGesture,
  moveConnectorGesture,
  endConnectorGesture,
  cancelConnectorGesture,
  setDependencySourceId,
  setDependencyHoverId,
  timelineWidth,
  startProjectPlacement,
  openTaskFromBar,
  startUnscheduledDrag,
  handleTaskScheduleKey,
  setSelectedTaskId,
  selectedTaskId,
  criticalVisible,
}: GanttRowTimelineProps) {
  const t = useTranslations("projects");
  const scheduled = row.startDate && row.dueDate;
  const left = scheduled ? calendarDistance(range.start, row.startDate!) * dayWidth : 0;
  const width = scheduled ? Math.max(dayWidth, (calendarDistance(row.startDate!, row.dueDate!) + 1) * dayWidth) : 0;
  const barColors = ganttBarColors(row.kind === "project" ? "project" : "task", row.color);
  const isCritical = Boolean(row.task && critical.has(row.id));
  const overflowSpans =
    row.kind === "project" && scheduled
      ? [
          row.overflowStart && row.overflowStart < row.startDate!
            ? {
                key: "start",
                left: calendarDistance(range.start, row.overflowStart) * dayWidth,
                width: calendarDistance(row.overflowStart, row.startDate!) * dayWidth,
              }
            : null,
          row.overflowEnd && row.overflowEnd > row.dueDate!
            ? {
                key: "end",
                left: (calendarDistance(range.start, row.dueDate!) + 1) * dayWidth,
                width: calendarDistance(row.dueDate!, row.overflowEnd) * dayWidth,
              }
            : null,
        ].filter((span): span is { key: string; left: number; width: number } => Boolean(span))
      : [];
  const manager = row.kind === "project"
    ? schedule.members.find((member) => member.id === project.managerId)?.name
    : null;
  const isDependencySource = Boolean(
    row.task && dependencySourceId === row.task.id,
  );
  const isDependencyTarget = Boolean(
    row.task && validDependencyTarget(row.task.id),
  );
  const dependencyTargetHandle = isDependencyTarget ? (
    <span
      className="pointer-events-none absolute top-1/2 -left-1 z-20 size-2.5 -translate-y-1/2 rounded-full border-2 border-indigo-600 bg-card shadow-sm"
      aria-hidden
    />
  ) : null;
  const interactiveBarWidth =
    scheduled && row.isMilestone && !row.isSummary
      ? Math.max(dayWidth, 24)
      : width;
  const startHandleLeft = Math.max(0, left - 12);
  const endHandleLeft = Math.max(
    left + interactiveBarWidth,
    startHandleLeft + 12,
  );
  const resizeControls = scheduled && !row.isMilestone ? (
    <>
      <button
        type="button"
        data-resize-edge="start"
        aria-label={`${t("dragStart")}: ${row.label}`}
        aria-keyshortcuts="ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight"
        title={t("dragStart")}
        disabled={scheduleCommitPending || dependencyCommitPending}
        className="absolute top-2 z-30 flex h-7 w-3 touch-none cursor-ew-resize items-center justify-center rounded-l-sm border border-r-0 bg-background/95 text-foreground opacity-0 shadow-sm transition-opacity motion-reduce:transition-none group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus:opacity-100 focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none"
        style={{ left: startHandleLeft }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onPointerDown={(event) => {
          if (row.task) startDrag(event, row.task, "start");
          else startProjectDrag(event, project, row, "start");
        }}
        onPointerMove={(event) => {
          if (row.task) moveDrag(event);
          else moveProjectDrag(event);
        }}
        onPointerUp={(event) => {
          if (row.task) endDrag(event);
          else endProjectDrag(event);
        }}
        onPointerCancel={(event) => {
          if (row.task) cancelTaskDrag(event);
          else cancelProjectDrag(event);
        }}
        onKeyDown={(event) =>
          handleScheduleResizeKey(event, row, project, "start")
        }
      >
        <ChevronLeft className="size-3" />
      </button>
      <button
        type="button"
        data-resize-edge="end"
        aria-label={`${t("dragEnd")}: ${row.label}`}
        aria-keyshortcuts="ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight"
        title={t("dragEnd")}
        disabled={scheduleCommitPending || dependencyCommitPending}
        className="absolute top-2 z-30 flex h-7 w-3 touch-none cursor-ew-resize items-center justify-center rounded-r-sm border border-l-0 bg-background/95 text-foreground opacity-0 shadow-sm transition-opacity motion-reduce:transition-none group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus:opacity-100 focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none"
        style={{ left: endHandleLeft }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onPointerDown={(event) => {
          if (row.task) startDrag(event, row.task, "end");
          else startProjectDrag(event, project, row, "end");
        }}
        onPointerMove={(event) => {
          if (row.task) moveDrag(event);
          else moveProjectDrag(event);
        }}
        onPointerUp={(event) => {
          if (row.task) endDrag(event);
          else endProjectDrag(event);
        }}
        onPointerCancel={(event) => {
          if (row.task) cancelTaskDrag(event);
          else cancelProjectDrag(event);
        }}
        onKeyDown={(event) =>
          handleScheduleResizeKey(event, row, project, "end")
        }
      >
        <ChevronRight className="size-3" />
      </button>
    </>
  ) : null;
  const endpointConnector = row.task && !isDraftTask(row.task.id) && scheduled ? (
    <button
      type="button"
      aria-label={t("dependencyConnector", { name: row.label })}
      title={t("dependencyConnectorHint")}
      disabled={scheduleCommitPending || dependencyCommitPending}
      className={cn(
        "absolute top-[22px] z-40 size-3 -translate-y-1/2 rounded-full border-2 bg-card shadow-sm transition-[transform,opacity] duration-150 hover:scale-125 focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none",
        isDependencySource
          ? "border-amber-600 opacity-100"
          : "border-indigo-600 opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus:opacity-100",
      )}
      style={{
        left: row.isMilestone
          ? left + interactiveBarWidth + 4
          : endHandleLeft + 14,
      }}
      onPointerDown={(event) => startConnectorGesture(event, row.task!)}
      onPointerMove={moveConnectorGesture}
      onPointerUp={endConnectorGesture}
      onPointerCancel={cancelConnectorGesture}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        setDependencySourceId((current) =>
          current === row.task!.id ? null : row.task!.id,
        );
      }}
    />
  ) : null;
  return (
    <div
      data-timeline-row
      className="relative z-[2] h-full"
      onClick={(event) => {
        if (
          dependencySourceId &&
          event.target === event.currentTarget
        ) {
          setDependencySourceId(null);
          setDependencyHoverId(null);
        }
      }}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={cancelTaskDrag}
      style={{ width: timelineWidth, backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent ${dayWidth - 1}px, color-mix(in oklab, var(--border) 22%, transparent) ${dayWidth - 1}px, color-mix(in oklab, var(--border) 22%, transparent) ${dayWidth}px)` }}
    >
      {!scheduled && row.kind === "project" && row.placement && (
        <button
          type="button"
          data-task-bar="true"
          className="group absolute top-2 h-7 cursor-grab overflow-hidden rounded-md border border-dashed border-slate-500 bg-slate-100/80 text-left shadow-xs active:cursor-grabbing dark:bg-slate-900/70"
          style={{
            left: calendarDistance(range.start, row.placement.startDate) * dayWidth,
            width: Math.max(
              120,
              (calendarDistance(row.placement.startDate, row.placement.dueDate) + 1) * dayWidth,
            ),
          }}
          onPointerDown={(event) => startProjectPlacement(event, project, row)}
          onPointerMove={moveProjectDrag}
          onPointerUp={endProjectDrag}
          onPointerCancel={cancelProjectDrag}
          title={t("dragProjectPreset")}
          aria-label={`${row.label}, ${t("dragProjectPreset")}`}
        >
          <span className="block truncate px-2 text-[10px] font-medium leading-6 text-muted-foreground">
            {t("projectTimelinePreset")}
          </span>
        </button>
      )}
      {!scheduled && row.task && (
        <button
          type="button"
          data-task-bar="true"
          onClick={() => openTaskFromBar(row.task)}
          onPointerDown={(event) => {
            if (row.task && !dependencySourceId) startUnscheduledDrag(event, row.task);
          }}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={cancelTaskDrag}
          onPointerEnter={() => isDependencyTarget && setDependencyHoverId(row.task!.id)}
          onPointerLeave={() => setDependencyHoverId((current) => current === row.task?.id ? null : current)}
          onKeyDown={(event) => handleTaskScheduleKey(event, row)}
          onFocus={() => row.task && !isDraftTask(row.task.id) && setSelectedTaskId(row.task.id)}
          aria-current={selectedTaskId === row.task.id ? "true" : undefined}
          className={cn(
            "group absolute top-2 h-7 cursor-grab overflow-visible rounded-md border border-dashed border-indigo-400 bg-indigo-50/80 text-left shadow-xs active:cursor-grabbing dark:bg-indigo-950/30",
            isDependencyTarget && "ring-2 ring-indigo-400/70",
            selectedTaskId === row.task.id && "outline-2 outline-offset-1 outline-indigo-600",
          )}
          style={{
            left: row.placement
              ? calendarDistance(range.start, row.placement.startDate) * dayWidth
              : 8,
            width: row.placement
              ? Math.max(
                  dayWidth,
                  (calendarDistance(row.placement.startDate, row.placement.dueDate) + 1) * dayWidth,
                )
              : 96,
          }}
          title={t("dragToSchedule")}
          aria-label={`${row.label}, ${t("unscheduled")}`}
        >
          <span className="block truncate px-2 text-[10px] font-medium leading-6 text-indigo-800 dark:text-indigo-200">
            {row.isSummary
              ? t("unscheduledSubtasks", { count: row.unscheduledCount ?? 0 })
              : t("unscheduled")}
          </span>
          <span className="absolute inset-y-0 right-0 hidden w-3 items-center justify-center bg-background/70 text-foreground group-hover:flex"><ChevronRight className="size-3" /></span>
        </button>
      )}
      {scheduled && row.isMilestone && !row.isSummary ? (
        <button
          type="button"
          data-task-bar="true"
          onClick={() => openTaskFromBar(row.task)}
          onPointerDown={(event) => {
            if (row.task && !dependencySourceId) startDrag(event, row.task, "move");
          }}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={cancelTaskDrag}
          onPointerEnter={() => isDependencyTarget && setDependencyHoverId(row.task!.id)}
          onPointerLeave={() => setDependencyHoverId((current) => current === row.task?.id ? null : current)}
          onKeyDown={(event) => handleTaskScheduleKey(event, row)}
          onFocus={() => row.task && !isDraftTask(row.task.id) && setSelectedTaskId(row.task.id)}
          className={cn(
            "group absolute top-2 h-7 cursor-grab overflow-visible rounded-md focus-visible:ring-2 focus-visible:ring-ring",
            isCritical && criticalVisible && "ring-2 ring-red-500",
            isDependencyTarget && "ring-2 ring-indigo-400/70",
            selectedTaskId === row.task?.id && "outline-2 outline-offset-1 outline-indigo-600",
          )}
          style={{ left, width: Math.max(dayWidth, 24) }}
          aria-current={selectedTaskId === row.task?.id ? "true" : undefined}
          aria-label={`${row.label}, ${row.startDate}`}
        >
          <span className="absolute top-1/2 left-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 border-indigo-700 bg-indigo-500 shadow-sm" />
          {dependencyTargetHandle}
        </button>
      ) : scheduled && row.isSummary ? (
        <button
          type="button"
          data-task-bar="true"
          onClick={() => openTaskFromBar(row.task)}
          onPointerDown={(event) => {
            if (row.task && !dependencySourceId) startDrag(event, row.task, "move");
          }}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={cancelTaskDrag}
          onPointerEnter={() => isDependencyTarget && setDependencyHoverId(row.task!.id)}
          onPointerLeave={() => setDependencyHoverId((current) => current === row.task?.id ? null : current)}
          onKeyDown={(event) => handleTaskScheduleKey(event, row)}
          onFocus={() => row.task && !isDraftTask(row.task.id) && setSelectedTaskId(row.task.id)}
          data-summary-bracket="true"
          className={cn(
            "group absolute top-[13px] h-[18px] cursor-grab overflow-visible rounded-[4px] focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing",
            isCritical && criticalVisible && "ring-2 ring-red-500",
            isDependencyTarget && "ring-2 ring-indigo-400/70",
            selectedTaskId === row.task?.id && "outline-2 outline-offset-1 outline-indigo-600",
          )}
          style={{ left, width }}
          aria-label={`${row.label}, ${row.startDate} - ${row.dueDate}`}
          aria-current={selectedTaskId === row.task?.id ? "true" : undefined}
          title={row.label}
        >
          <span className="pointer-events-none absolute inset-0 rounded-[4px] border border-indigo-500/75 bg-indigo-100/85 shadow-xs dark:bg-indigo-950/65" />
          <span
            className="pointer-events-none absolute inset-y-0.5 left-0.5 rounded-[3px] bg-indigo-500/35"
            style={{ width: `${row.progress}%` }}
          />
          <span className="pointer-events-none absolute top-[calc(100%-1px)] left-0 h-1.5 w-0.5 bg-indigo-700 dark:bg-indigo-300" />
          <span className="pointer-events-none absolute top-[calc(100%-1px)] right-0 h-1.5 w-0.5 bg-indigo-700 dark:bg-indigo-300" />
          {dependencyTargetHandle}
          {width > 72 && <span className="pointer-events-none relative z-[1] block truncate px-2 text-left text-[10px] font-semibold leading-[17px] text-indigo-950 dark:text-indigo-100">{row.label}</span>}
        </button>
      ) : scheduled && (
        <button
          type="button"
          data-task-bar={row.task ? "true" : undefined}
          onClick={() => openTaskFromBar(row.task)}
          onPointerDown={(event) => {
            // The bar's own ends resize it, like the handles beside it.
            const bounds = event.currentTarget.getBoundingClientRect();
            const mode = row.isMilestone
              ? "move"
              : barEdgeAt(event.clientX - bounds.left, bounds.width) ?? "move";
            if (row.task) {
              if (!dependencySourceId) startDrag(event, row.task, mode);
            } else {
              startProjectDrag(event, project, row, mode);
            }
          }}
          onPointerMove={(event) => {
            if (row.task) moveDrag(event);
            else moveProjectDrag(event);
          }}
          onPointerUp={(event) => {
            if (row.task) endDrag(event);
            else endProjectDrag(event);
          }}
          onPointerCancel={(event) => {
            if (row.task) cancelTaskDrag(event);
            else cancelProjectDrag(event);
          }}
          onPointerEnter={() => isDependencyTarget && setDependencyHoverId(row.task!.id)}
          onPointerLeave={() => setDependencyHoverId((current) => current === row.task?.id ? null : current)}
          onKeyDown={(event) => handleTaskScheduleKey(event, row)}
          onFocus={() => row.task && !isDraftTask(row.task.id) && setSelectedTaskId(row.task.id)}
          className={cn(
            "group absolute overflow-visible border transition-shadow motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-ring",
            "cursor-grab active:cursor-grabbing",
            row.kind === "project"
              ? "top-2 h-7 rounded-md border-2 shadow-sm"
              : "top-2 h-7 rounded-md shadow-xs",
            isCritical && criticalVisible && "ring-2 ring-red-500",
            isDependencyTarget && "ring-2 ring-indigo-400/70",
            selectedTaskId === row.task?.id && "outline-2 outline-offset-1 outline-indigo-600",
          )}
          style={{
            left,
            width,
            borderColor: barColors.border,
            backgroundColor: barColors.background,
          }}
          title={manager ? t("projectManagerTooltip", { name: manager }) : undefined}
          aria-current={selectedTaskId === row.task?.id ? "true" : undefined}
          aria-label={`${row.label}, ${row.startDate} – ${row.dueDate}`}
        >
          <span
            className="absolute inset-y-0 left-0 opacity-75"
            style={{
              width: `${row.progress}%`,
              backgroundColor: barColors.progress,
            }}
          />
          {!row.isMilestone && (["start", "end"] as const).map((edge) => (
            <span
              key={edge}
              data-bar-edge={edge}
              className={cn("absolute inset-y-0 z-[3] cursor-ew-resize", edge === "start" ? "left-0" : "right-0")}
              style={{ width: barEdgeGrabWidth(width) }}
              aria-hidden
            />
          ))}
          {dependencyTargetHandle}
          {width > 72 && <span className={cn(
            "relative z-[1] block truncate px-2 text-left text-[10px]",
            row.kind === "project"
              ? "font-semibold leading-6"
              : "font-medium leading-6",
          )}>{row.label}</span>}
          {manager && <span className="pointer-events-none absolute right-5 top-1/2 z-[2] max-w-40 -translate-y-1/2 truncate rounded-sm bg-background/90 px-1.5 py-0.5 text-[10px] font-medium text-foreground opacity-0 shadow-sm transition-opacity motion-reduce:transition-none group-hover:opacity-100"><UserIdentity userId={project.managerId} name={manager} compact /></span>}
        </button>
      )}
      {resizeControls}
      {endpointConnector}
      {/* Work reaching past the project's authored window (R4). The
          bar itself never stretches to swallow it. */}
      {overflowSpans.map((span) => (
        <span
          key={span.key}
          data-project-overflow={span.key}
          className="pointer-events-none absolute top-2 h-7 rounded-md border border-dashed border-amber-500/80"
          style={{
            left: span.left,
            width: Math.max(2, span.width),
            backgroundImage:
              "repeating-linear-gradient(45deg, color-mix(in oklab, var(--color-amber-500) 24%, transparent) 0 4px, transparent 4px 8px)",
          }}
          aria-hidden
        />
      ))}
    </div>
  );
}
