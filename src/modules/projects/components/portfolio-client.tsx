"use client";

import {
  useCallback,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { PortfolioSchedule } from "@/modules/projects/queries";
import { taskAncestors } from "@/modules/projects/schedule";
import { ProjectsClient } from "./projects-client";
import { ProjectDialogs, projectPredecessorOptions, type ProjectDialogState } from "./project-dialog";
import { cn } from "@/lib/utils";
import { localDateInZone } from "@/modules/calendar/date-utils";
import { ZOOM_WIDTH } from "./portfolio/portfolio-constants";
import type {
  EmbeddedProjectPlanner,
  ProjectCard,
} from "./portfolio/portfolio-types";
import { layoutDependencyRoutes } from "./portfolio/dependency-geometry";
import { DeadlineLane } from "./portfolio/deadline-lane";
import { DependencyEditorPopovers } from "./portfolio/dependency-editor-panel";
import { DependencyLines } from "./portfolio/dependency-lines";
import { DependencyLinkingStrip } from "./portfolio/dependency-linking-strip";
import { FocusRail } from "./portfolio/focus-rail";
import { GanttRow } from "./portfolio/gantt-row";
import { MobileWorkBreakdown } from "./portfolio/mobile-work-breakdown";
import { DeleteTaskDialog } from "./portfolio/delete-task-dialog";
import { PortfolioHeader, TimelineToolbar } from "./portfolio/portfolio-toolbar";
import { ScheduleInspector } from "./portfolio/schedule-inspector";
import {
  TimelineGridBackground,
  TimelineHeader,
} from "./portfolio/timeline-scale";
import { useBarDrag } from "./portfolio/use-bar-drag";
import { useDeadlineDrag } from "./portfolio/use-deadline-drag";
import { useDependencyEditor } from "./portfolio/use-dependency-editor";
import { useDependencyLinking } from "./portfolio/use-dependency-linking";
import { useDragClickGuard } from "./portfolio/use-drag-click-guard";
import { useEffectiveSchedule } from "./portfolio/use-effective-schedule";
import { useInspectorDockWidth } from "./portfolio/use-inspector-dock-width";
import { useMediaQuery } from "./portfolio/use-media-query";
import { usePortfolioFocus } from "./portfolio/use-portfolio-focus";
import { usePortfolioRows } from "./portfolio/use-portfolio-rows";
import { useScheduleCommit } from "./portfolio/use-schedule-commit";
import { useStructureDrag } from "./portfolio/use-structure-drag";
import { useTaskTreeActions } from "./portfolio/use-task-tree-actions";
import { useTimelineLayout } from "./portfolio/use-timeline-layout";
import { useTimelineViewport } from "./portfolio/use-timeline-viewport";

export type { EmbeddedProjectPlanner } from "./portfolio/portfolio-types";

// The timeline is assembled from the pieces in ./portfolio/: hooks own state and gestures,
// components render the chrome, rows, dependency lines and dialogs.
export function PortfolioClient({
  schedule,
  projects,
  initialFocusedTaskId = null,
  embedded,
}: {
  schedule: PortfolioSchedule;
  projects: ProjectCard[];
  initialFocusedTaskId?: string | null;
  embedded?: EmbeddedProjectPlanner;
}) {
  const t = useTranslations("projects");
  const router = useRouter();
  const refreshSchedule = useCallback(() => {
    if (embedded) return embedded.onRefresh();
    router.refresh();
    return Promise.resolve();
  }, [embedded, router]);
  const isEmbedded = Boolean(embedded);
  const isDraftTask = (id: string) => id === embedded?.draftTask.id;
  const desktopInspector = useMediaQuery("(min-width: 960px)");
  const compactInspector = useMediaQuery("(max-width: 767px)");
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [renderedAt] = useState(() => new Date());
  const today = localDateInZone(renderedAt, "Europe/Vienna");
  const [view, setView] = useState<"timeline" | "projects">("timeline");
  const [query, setQuery] = useState("");
  const [owner, setOwner] = useState("all");
  const [health, setHealth] = useState<"all" | "risk" | "track">("all");
  const [criticalVisible, setCriticalVisible] = useState(false);
  const [structurePending, setStructurePending] = useState(false);
  const [linesVisible, setLinesVisible] = useState(true);

  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(() => new Set(embedded ? [embedded.projectId] : []));
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(() => new Set());
  const [projectDialog, setProjectDialog] = useState<ProjectDialogState>(null);
  const [inspectorOpen, setInspectorOpen] = useState(Boolean(initialFocusedTaskId));
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(
    initialFocusedTaskId,
  );
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(
    initialFocusedTaskId,
  );
  const [revealTaskId, setRevealTaskId] = useState<string | null>(null);
  const dayWidthRef = useRef(ZOOM_WIDTH.month);

  // Local state, gestures and derived data, grouped by concern (see ./portfolio/use-*.ts).
  const { draggedRef, trackDragMovement, releaseDragFlag } = useDragClickGuard();
  const {
    dependencySourceId, setDependencySourceId, dependencyHoverId, setDependencyHoverId,
    hoveredDependencyId, setHoveredDependencyId, dependencyDraft, setDependencyDraft,
    dependencyEditorOpen, setDependencyEditorOpen, dependencyCommitPending, dependencyRouteDragging,
    openDependencyEditor, selectDependency, cancelDependencyEditor, beginDependencyRouteDrag,
    nudgeDependencyRoute, saveGraphicalDependency, deleteGraphicalDependency,
  } = useDependencyEditor({ schedule, refreshSchedule, dayWidthRef });
  const {
    zoom, setZoom, dayWidth, setDayWidth, treeWidth, setTreeWidth, ganttViewportWidth, scrollRef,
    treeResizeRef, viewPanning, beginViewPan, moveViewPan, endViewPan, handlePanClickCapture,
    setTimelineDayWidth, setTimelineZoom,
  } = useTimelineViewport({
    view, focusedTaskId, embedded, dayWidthRef, cancelDependencyEditor, setDependencySourceId,
    setDependencyHoverId,
  });
  const { inspectorWidth, onDockResizePointerDown, onDockResizeKeyDown } = useInspectorDockWidth();
  const {
    deadlinePreview, setDeadlinePreview, deadlinePreviewFrameRef, startDeadlineDrag, moveDeadlineDrag,
    endDeadlineDrag, cancelDeadlineDrag, handleDeadlineKey,
  } = useDeadlineDrag({
    dayWidth, dependencyCommitPending, dependencyEditorOpen, draggedRef, trackDragMovement,
    releaseDragFlag, refreshSchedule,
  });
  const {
    dragPreview, setDragPreview, scheduleCommitPending, draft, projectDraft, activePreview, previewFrameRef,
    atomicPreview, previewCascade, queuePreview, clearDrag, offerScheduleUndo, fitTaskDates,
    fsLeadAdjustments, withLagAdjustments, commitSchedule,
  } = useScheduleCommit({
    schedule, embedded, isDraftTask, refreshSchedule, setDeadlinePreview, setDependencyDraft,
    setDependencyEditorOpen,
  });
  const {
    newTaskContext, toggle, openTask, revealProject, newTask, pendingDelete, setPendingDelete,
    deletePending, requestDeleteTask, confirmDeleteTask, outdentChildrenThenDelete, indentRow,
    outdentRow,
  } = useTaskTreeActions({
    schedule, embedded, isDraftTask, refreshSchedule, reducedMotion, scrollRef, selectedTaskId,
    structurePending, setStructurePending, setExpandedProjects, setExpandedTasks, setSelectedTaskId,
    setInspectorOpen, setOwner, setHealth, setQuery,
  });
  const { fittedFocusRef, enterTaskFocus, exitTaskFocus, copyFocusLink } = usePortfolioFocus({
    initialFocusedTaskId, embedded, schedule, focusedTaskId, setFocusedTaskId,
    selectedTaskId, setSelectedTaskId, inspectorOpen, setInspectorOpen, expandedProjects,
    setExpandedProjects, expandedTasks, setExpandedTasks, treeWidth, setTreeWidth, dayWidthRef,
    setDayWidth, setZoom, scrollRef, setTimelineDayWidth, openTask,
  });
  const { effectiveSchedule } = useEffectiveSchedule({
    schedule, embedded, dragPreview, activePreview, draft, deadlinePreview, dependencyDraft,
  });
  const {
    selectedTask, focusedTask, focusedProject, focusedSubtree, focusDependencies,
    visibleFocusDependencyIds, conflicts, critical, tasksByProject, visibleProjects, searchResults, rows,
  } = usePortfolioRows({
    schedule, effectiveSchedule, embedded, selectedTaskId, focusedTaskId, criticalVisible, owner,
    health, today, query, expandedProjects, expandedTasks, setExpandedProjects, setExpandedTasks,
  });
  const {
    range, dayCount, renderedRangeEnd, timelineWidth, totalWidth, deadlineLaneHeight, totalHeight,
    scrollToToday, fitTimelineView,
  } = useTimelineLayout({
    view, focusedTaskId, focusedTask, schedule, effectiveSchedule, embedded, visibleProjects, today,
    rows, ganttViewportWidth, treeWidth, dayWidth, dayWidthRef, setDayWidth, setZoom, scrollRef,
    fittedFocusRef, revealTaskId, setRevealTaskId, reducedMotion, setTimelineDayWidth,
  });
  const dependencyLayout = layoutDependencyRoutes({
    rows, effectiveSchedule, visibleFocusDependencyIds, dependencyDraft, range, dayWidth,
  });
  const {
    structureDrag, structureDrop, insertionIndicatorId, beginStructureDrag,
    updateStructureDrag, endStructureDrag, cancelStructureDrag, structureKey, tidyDependencyLines,
  } = useStructureDrag({
    rows, effectiveSchedule, scrollRef, refreshSchedule, structurePending, setStructurePending,
    setExpandedProjects, setExpandedTasks,
    dependencyGeometries: dependencyLayout.dependencyGeometries, setDependencyDraft,
  });
  const {
    dragRef, cancelTaskDrag, cancelProjectDrag, startDrag, startUnscheduledDrag, moveDrag, endDrag,
    handleTaskScheduleKey, startProjectDrag, startProjectPlacement, moveProjectDrag,
    handleScheduleResizeKey, endProjectDrag,
  } = useBarDrag({
    rows, range, dayWidth, isDraftTask, inspectorOpen, setInspectorOpen, focusedTaskId, draggedRef,
    trackDragMovement, releaseDragFlag, scheduleCommitPending, clearDrag, setDragPreview,
    previewCascade, queuePreview, atomicPreview, commitSchedule, fsLeadAdjustments,
    withLagAdjustments, draft, projectDraft, dependencyCommitPending, dependencyEditorOpen,
    dependencyDraft, dependencySourceId, setDependencySourceId, setDependencyHoverId,
    cancelDependencyEditor, outdentRow, indentRow, enterTaskFocus, exitTaskFocus,
  });
  const {
    validDependencyTarget, startConnectorGesture, moveConnectorGesture, endConnectorGesture,
    cancelConnectorGesture, openTaskFromBar,
  } = useDependencyLinking({
    isDraftTask, effectiveSchedule, dependencySourceId, setDependencySourceId, setDependencyHoverId,
    setDependencyDraft, setDependencyEditorOpen, dependencyCommitPending, dependencyEditorOpen,
    draggedRef, releaseDragFlag, dragRef, moveDrag, endDrag, cancelTaskDrag, setDragPreview,
    scheduleCommitPending, previewFrameRef, deadlinePreviewFrameRef, openTask,
  });

  // Everything a Gantt row needs; each row picks what it renders.
  const rowContext = {
    effectiveSchedule, focusedTask, totalWidth, tasksByProject, today, conflicts, critical, schedule,
    selectedTaskId, setSelectedTaskId, treeWidth, timelineWidth, range, dayWidth, embedded,
    isDraftTask, expandedProjects, expandedTasks, setExpandedProjects, setExpandedTasks,
    refreshSchedule, criticalVisible, structureDrag, structureDrop, structurePending,
    beginStructureDrag, updateStructureDrag, endStructureDrag, cancelStructureDrag, structureKey,
    insertionIndicatorId, toggle, openTask, newTask, outdentRow, indentRow, requestDeleteTask,
    offerScheduleUndo, fitTaskDates, setProjectDialog, enterTaskFocus, scheduleCommitPending, dependencyCommitPending,
    dependencySourceId, setDependencySourceId, setDependencyHoverId, startDrag, moveDrag, endDrag,
    cancelTaskDrag, startUnscheduledDrag, handleTaskScheduleKey, startProjectDrag, moveProjectDrag,
    endProjectDrag, cancelProjectDrag, startProjectPlacement, handleScheduleResizeKey,
    validDependencyTarget, startConnectorGesture, moveConnectorGesture, endConnectorGesture,
    cancelConnectorGesture, openTaskFromBar,
  };

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col",
        focusedTask ? "gap-3" : "gap-5",
      )}
      data-focused-task-id={focusedTask?.id}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        if (dependencyEditorOpen || dependencyDraft) cancelDependencyEditor();
        else if (dependencySourceId) {
          setDependencySourceId(null);
          setDependencyHoverId(null);
        } else if (draft || projectDraft) clearDrag();
        else if (inspectorOpen) setInspectorOpen(false);
        else if (focusedTaskId) exitTaskFocus();
      }}
    >
      {focusedTask && focusedProject ? (
        <FocusRail
          {...{
            focusedTask, focusedProject, focusedSubtree, focusDependencies, schedule, enterTaskFocus,
            exitTaskFocus, copyFocusLink, fitTimelineView, scrollToToday, zoom, setTimelineZoom,
            criticalVisible, setCriticalVisible,
          }}
        />
      ) : (
      !embedded && (
        <PortfolioHeader
          schedule={schedule}
          tasksByProject={tasksByProject}
          today={today}
          setProjectDialog={setProjectDialog}
        />
      )
      )}

      {!focusedTask && (
        <TimelineToolbar
          {...{
            embedded, view, setView, query, setQuery, searchResults, revealProject, enterTaskFocus,
            schedule, owner, setOwner, health, setHealth, zoom, setTimelineZoom, fitTimelineView,
            scrollToToday, criticalVisible, setCriticalVisible, structurePending, tidyDependencyLines,
            linesVisible, setLinesVisible, structureDrag, structureDrop,
          }}
        />
      )}

      {view === "projects" && !focusedTask ? (
        <ProjectsClient projects={projects} members={schedule.members} predecessorOptions={projectPredecessorOptions(schedule)} />
      ) : (
        <div className="flex min-h-0 min-w-0 overflow-hidden rounded-lg border bg-card">
          <div className="min-w-0 flex-1">
          {dependencySourceId && (
            <DependencyLinkingStrip
              dependencySourceId={dependencySourceId}
              schedule={schedule}
              setDependencySourceId={setDependencySourceId}
              setDependencyHoverId={setDependencyHoverId}
            />
          )}
          <MobileWorkBreakdown
            {...{
              embedded, focusedTask, schedule, rows, expandedTasks, selectedTaskId, openTask,
              handleTaskScheduleKey,
            }}
          />

          <div
            ref={scrollRef}
            className={cn(
              "gantt-scrollbar overflow-auto bg-card",
              viewPanning && "select-none cursor-grabbing [&_*]:cursor-grabbing",
              !embedded && "hidden md:block",
              embedded ? "max-h-[55dvh]" : focusedTask
                ? "max-h-[calc(100dvh-7.5rem)]"
                : "max-h-[calc(100dvh-15rem)]",
            )}
            tabIndex={0}
            onPointerDown={beginViewPan}
            onPointerMove={moveViewPan}
            onPointerUp={endViewPan}
            onPointerCancel={endViewPan}
            onLostPointerCapture={endViewPan}
            onClickCapture={handlePanClickCapture}
            data-testid="portfolio-gantt"
            role="tree"
            aria-label={t("workBreakdown")}
          >
            <div className="relative" style={{ width: totalWidth, minHeight: Math.max(totalHeight, 280) }}>
              <TimelineHeader
                {...{
                  totalWidth, treeWidth, treeResizeRef, setTreeWidth, timelineWidth, dayCount, range,
                  zoom, dayWidth, today, renderedRangeEnd,
                }}
              />

              <TimelineGridBackground
                {...{
                  treeWidth, timelineWidth, deadlineLaneHeight, rows, dayCount, range, dayWidth, today,
                  renderedRangeEnd,
                }}
              />

              <DependencyLines
                {...dependencyLayout}
                {...{
                  treeWidth, deadlineLaneHeight, timelineWidth, rows, linesVisible, dependencyDraft,
                  hoveredDependencyId, setHoveredDependencyId, conflicts, effectiveSchedule,
                  selectedTaskId, scrollRef, selectDependency, openDependencyEditor,
                  dependencyRouteDragging, beginDependencyRouteDrag, nudgeDependencyRoute,
                  dependencySourceId, dependencyHoverId, range, dayWidth,
                }}
              />

              <DependencyEditorPopovers
                {...dependencyLayout}
                {...{
                  linesVisible, dependencyDraft, dependencyEditorOpen, openDependencyEditor,
                  cancelDependencyEditor, treeWidth, deadlineLaneHeight, effectiveSchedule,
                  dependencyCommitPending, schedule, setDependencyDraft, saveGraphicalDependency,
                  deleteGraphicalDependency,
                }}
              />

              {deadlineLaneHeight > 0 && (
                <DeadlineLane
                  {...{
                    totalWidth, treeWidth, timelineWidth, effectiveSchedule, range, renderedRangeEnd,
                    renderedAt, dayWidth, draggedRef, startDeadlineDrag, moveDeadlineDrag,
                    endDeadlineDrag, cancelDeadlineDrag, handleDeadlineKey,
                  }}
                />
              )}

              {rows.map((row) => (
                <GanttRow key={row.id} row={row} {...rowContext} />
              ))}
              {rows.length === 0 && <div className="sticky left-0 flex h-52 w-[min(100vw,50rem)] items-center justify-center text-sm text-muted-foreground">{t("noScheduleResults")}</div>}
            </div>
          </div>
          </div>
          <ScheduleInspector
            open={inspectorOpen}
            onOpenChange={setInspectorOpen}
            presentation={
              desktopInspector
                ? "dock"
                : compactInspector
                  ? "sheet-bottom"
                  : "sheet-right"
            }
            dockWidth={inspectorWidth}
            onDockResizePointerDown={onDockResizePointerDown}
            onDockResizeKeyDown={onDockResizeKeyDown}
            schedule={schedule}
            onScheduleChanged={embedded ? refreshSchedule : undefined}
            onDeleteTask={selectedTask && !isDraftTask(selectedTask.id) ? requestDeleteTask : undefined}
            onFitToChildren={fitTaskDates}
            embedded={isEmbedded}
            task={selectedTask}
            defaultProjectId={newTaskContext?.projectId ?? null}
            defaultParentTaskId={newTaskContext?.parentTaskId ?? null}
            onAddSubtask={(parent) => newTask(parent.projectId, parent.id)}
            onOpenTask={openTask}
            onFocusTask={enterTaskFocus}
            isTaskFocused={Boolean(selectedTask && selectedTask.id === focusedTaskId)}
            onTaskSaved={(taskId, parentTaskId) => {
              if (parentTaskId) {
                const ancestors = taskAncestors(schedule.tasks, parentTaskId);
                setExpandedTasks((current) => {
                  const next = new Set(current);
                  next.add(parentTaskId);
                  ancestors.forEach((ancestor) => next.add(ancestor.id));
                  return next;
                });
              }
              setRevealTaskId(taskId);
            }}
          />
        </div>
      )}

      <ProjectDialogs state={projectDialog} onStateChange={setProjectDialog} members={schedule.members} predecessorOptions={projectPredecessorOptions(schedule)} />
      <DeleteTaskDialog
        pendingDelete={pendingDelete}
        setPendingDelete={setPendingDelete}
        deletePending={deletePending}
        outdentChildrenThenDelete={outdentChildrenThenDelete}
        confirmDeleteTask={confirmDeleteTask}
      />
    </div>
  );
}
