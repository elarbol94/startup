// One Gantt row of the portfolio timeline: the row shell that combines the work-breakdown
// cell and the timeline cell. Used by portfolio-client.tsx.
"use client";

import type { PortfolioSchedule, PortfolioTask } from "@/modules/projects/queries";
import { cn } from "@/lib/utils";
import { ROW_HEIGHT } from "./portfolio-constants";
import {
  GanttRowTimeline,
  type GanttRowTimelineProps,
} from "./gantt-row-timeline";
import {
  GanttRowTreeCell,
  type GanttRowTreeCellProps,
} from "./gantt-row-tree-cell";

export type GanttRowProps = Omit<
  GanttRowTreeCellProps & GanttRowTimelineProps,
  "project"
> & {
  effectiveSchedule: PortfolioSchedule;
  focusedTask: PortfolioTask | null;
  totalWidth: number;
};

export function GanttRow(props: GanttRowProps) {
  const {
    row,
    effectiveSchedule,
    focusedTask,
    expandedProjects,
    expandedTasks,
    selectedTaskId,
    isDraftTask,
    totalWidth,
  } = props;
  const project = effectiveSchedule.projects.find((candidate) => candidate.id === row.projectId)!;
  return (
    <div
      key={row.id}
      data-row-kind={row.kind}
      data-task-id={row.task?.id}
      data-project-id={
        row.kind === "project" ? row.projectId : undefined
      }
      role="treeitem"
      aria-level={
        row.kind === "project"
          ? 1
          : (row.depth ?? 0) + (focusedTask ? 1 : 2)
      }
      aria-expanded={
        row.kind === "project"
          ? expandedProjects.has(row.projectId)
          : row.isSummary
            ? expandedTasks.has(row.id)
            : undefined
      }
      aria-current={
        selectedTaskId === row.task?.id ? "true" : undefined
      }
      aria-selected={selectedTaskId === row.task?.id}
      className={cn(
        "group/row relative flex border-b last:border-b-0",
        row.kind === "project" && "bg-muted/20",
        row.task && isDraftTask(row.task.id) && "bg-indigo-50/60 dark:bg-indigo-950/30",
      )}
      style={{ width: totalWidth, height: ROW_HEIGHT }}
    >
      <GanttRowTreeCell {...props} project={project} />
      <GanttRowTimeline {...props} project={project} />
    </div>
  );
}
