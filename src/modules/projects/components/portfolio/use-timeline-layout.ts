// Date range and pixel dimensions of the Gantt, plus the scroll positioning around them:
// initial fit, revealing a saved task, jump to today and fit-to-view. Used by portfolio-client.tsx.
"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import type {
  PortfolioSchedule,
  PortfolioTask,
} from "@/modules/projects/queries";
import {
  focusDateRange,
  resolveFocusedTaskSubtree,
} from "@/modules/projects/focus";
import {
  DEADLINE_LANE_HEIGHT,
  FIT_PADDING_DAYS,
  HEADER_HEIGHT,
  MAX_DAY_WIDTH,
  MIN_DAY_WIDTH,
  ROW_HEIGHT,
  ZOOM_WIDTH,
} from "./portfolio-constants";
import type { EmbeddedProjectPlanner, Row, SetState } from "./portfolio-types";
import {
  addCalendarDays,
  calendarDistance,
  maxDate,
  minDate,
  zoomModeForDayWidth,
} from "./portfolio-utils";
import type { useTimelineViewport } from "./use-timeline-viewport";

export function useTimelineLayout({
  view,
  focusedTaskId,
  focusedTask,
  schedule,
  effectiveSchedule,
  embedded,
  visibleProjects,
  today,
  rows,
  ganttViewportWidth,
  treeWidth,
  dayWidth,
  dayWidthRef,
  setDayWidth,
  setZoom,
  scrollRef,
  fittedFocusRef,
  revealTaskId,
  setRevealTaskId,
  reducedMotion,
  setTimelineDayWidth,
}: Pick<
  ReturnType<typeof useTimelineViewport>,
  | "ganttViewportWidth"
  | "treeWidth"
  | "dayWidth"
  | "setDayWidth"
  | "setZoom"
  | "scrollRef"
  | "setTimelineDayWidth"
> & {
  view: "timeline" | "projects";
  focusedTaskId: string | null;
  focusedTask: PortfolioTask | null;
  schedule: PortfolioSchedule;
  effectiveSchedule: PortfolioSchedule;
  embedded?: EmbeddedProjectPlanner;
  visibleProjects: PortfolioSchedule["projects"];
  today: string;
  rows: Row[];
  dayWidthRef: RefObject<number>;
  fittedFocusRef: RefObject<string | null>;
  revealTaskId: string | null;
  setRevealTaskId: SetState<string | null>;
  reducedMotion: boolean;
}) {
  const fittedPortfolioRef = useRef(false);

  const range = useMemo(() => {
    if (focusedTaskId) {
      const confirmedFocus = resolveFocusedTaskSubtree(
        schedule.tasks,
        focusedTaskId,
      );
      const focusRange = focusDateRange(confirmedFocus?.tasks ?? [], today, {
        paddingDays: FIT_PADDING_DAYS,
        fallbackDays: 20,
      });
      return {
        start: focusRange.startDate,
        end: focusRange.dueDate,
      };
    }
    const visibleProjectIds = new Set(
      visibleProjects.map((project) => project.id),
    );
    const scheduled = [
      ...schedule.projects
        .filter((project) => visibleProjectIds.has(project.id))
        .flatMap((project) => [
          project.plannedStartDate,
          project.targetEndDate,
        ]),
      ...schedule.tasks
        .filter((task) => visibleProjectIds.has(task.projectId))
        .flatMap((task) => [task.startDate, task.dueDate]),
      ...(embedded ? [embedded.draftTask.startDate, embedded.draftTask.dueDate] : schedule.deadlines.map((deadline) => deadline.dueDate)),
    ].filter((value): value is string => Boolean(value));
    const earliest = minDate(scheduled) ?? today;
    const latest = maxDate(scheduled) ?? today;
    return {
      start: addCalendarDays(earliest, -FIT_PADDING_DAYS),
      end: addCalendarDays(latest, FIT_PADDING_DAYS),
    };
  }, [
    focusedTaskId,
    schedule.tasks,
    embedded,
    schedule.projects,
    schedule.deadlines,
    visibleProjects,
    today,
  ]);
  const baseDayCount = calendarDistance(range.start, range.end) + 1;
  const viewportDayCount = Math.max(
    0,
    Math.ceil(
      Math.max(0, ganttViewportWidth - treeWidth) / Math.max(dayWidth, 1),
    ),
  );
  const dayCount = Math.max(baseDayCount, viewportDayCount);
  const renderedRangeEnd = addCalendarDays(range.start, dayCount - 1);
  const timelineWidth = dayCount * dayWidth;
  const totalWidth = treeWidth + timelineWidth;
  const deadlineLaneHeight =
    !embedded && !focusedTask && effectiveSchedule.deadlines.length > 0
      ? DEADLINE_LANE_HEIGHT
      : 0;
  const totalHeight = HEADER_HEIGHT + deadlineLaneHeight + rows.length * ROW_HEIGHT;

  useEffect(() => {
    if (view !== "timeline" || ganttViewportWidth <= 0) return;
    if (focusedTaskId ? fittedFocusRef.current === focusedTaskId : fittedPortfolioRef.current) return;
    const frame = requestAnimationFrame(() => {
      const container = scrollRef.current;
      if (!container) return;
      if (focusedTaskId) fittedFocusRef.current = focusedTaskId;
      else fittedPortfolioRef.current = true;
      const availableWidth = Math.max(120, container.clientWidth - treeWidth - 12);
      const nextWidth = focusedTaskId
        ? Math.min(MAX_DAY_WIDTH, Math.max(MIN_DAY_WIDTH, availableWidth / Math.max(1, baseDayCount)))
        : ZOOM_WIDTH.month;
      dayWidthRef.current = nextWidth;
      setDayWidth(nextWidth);
      setZoom(zoomModeForDayWidth(nextWidth));
      container.scrollTo({
        left: focusedTaskId ? 0 : Math.max(0, calendarDistance(range.start, today) * nextWidth - availableWidth / 2),
        behavior: "auto",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [
    view,
    ganttViewportWidth,
    focusedTaskId,
    baseDayCount,
    treeWidth,
    range.start,
    today,
    dayWidthRef,
    fittedFocusRef,
    scrollRef,
    setDayWidth,
    setZoom,
  ]);

  useEffect(() => {
    if (!revealTaskId) return;
    const row = scrollRef.current?.querySelector<HTMLElement>(
      `[data-task-id="${revealTaskId}"]`,
    );
    if (!row) return;
    row.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "center",
      inline: "nearest",
    });
    setRevealTaskId(null);
  }, [revealTaskId, rows, reducedMotion, scrollRef, setRevealTaskId]);

  function scrollToToday() {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;
    const todayOffset = calendarDistance(range.start, today) * dayWidth;
    const left = todayOffset - Math.max(120, scrollContainer.clientWidth - treeWidth) / 2;
    scrollContainer.scrollTo({
      left: Math.max(0, left),
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }

  function fitTimelineView() {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;
    const availableTimelineWidth = Math.max(
      240,
      scrollContainer.clientWidth - treeWidth - 12,
    );
    setTimelineDayWidth(availableTimelineWidth / Math.max(1, baseDayCount));
    requestAnimationFrame(() => {
      scrollContainer.scrollTo({
        left: 0,
        behavior: reducedMotion ? "auto" : "smooth",
      });
    });
  }

  return {
    range, dayCount, renderedRangeEnd, timelineWidth, totalWidth, deadlineLaneHeight, totalHeight,
    scrollToToday, fitTimelineView,
  };
}
