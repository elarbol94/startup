// Shared types for the portfolio Gantt timeline: rows, drag drafts, previews and stored view state.
// Used by portfolio-client.tsx and the pieces in components/portfolio/.
import type { Dispatch, SetStateAction } from "react";
import type {
  PortfolioSchedule,
  PortfolioTask,
} from "@/modules/projects/queries";
import type {
  SchedulePreview,
  suggestTaskPlacement,
} from "@/modules/projects/schedule";

export type ProjectCard = PortfolioSchedule["projects"][number] & { openTasks: number };
export type Zoom = "week" | "month" | "quarter";
export type Row = {
  id: string;
  kind: "project" | "task" | "subtask";
  projectId: string;
  label: string;
  color: string;
  progress: number;
  startDate: string | null;
  dueDate: string | null;
  isMilestone: boolean;
  isSummary?: boolean;
  unscheduledCount?: number;
  childTasks?: PortfolioTask[];
  task?: PortfolioTask;
  depth?: number;
  placement?: ReturnType<typeof suggestTaskPlacement>;
  // Set on project rows whose tasks reach outside the authored window (R4).
  overflowStart?: string | null;
  overflowEnd?: string | null;
};
export type TaskDraft = {
  taskId: string;
  startDate: string;
  dueDate: string;
  mode: "move" | "resize-start" | "resize-end" | "place";
};
export type ProjectDraft = {
  projectId: string;
  startDate: string;
  dueDate: string;
  mode: "move" | "resize-start" | "resize-end" | "place";
};
export type DragPreview = {
  preview: SchedulePreview | null;
  draft: TaskDraft | null;
  projectDraft: ProjectDraft | null;
  dependencies?: PortfolioDependency[];
};
export type DependencyLagAdjustment = {
  dependency: PortfolioDependency;
  lagDays: number;
};
export type DeadlinePreview = {
  id: string;
  deadlineDate: string;
  deadlineAt: string | null;
  updatedAt: string;
};
export type PortfolioDependency = PortfolioSchedule["dependencies"][number];
export type DependencyDraft = PortfolioDependency & {
  isNew: boolean;
};
export type PortfolioViewState = {
  dayWidth: number;
  scrollLeft: number;
  treeWidth: number;
  expandedProjects: Set<string>;
  expandedTasks: Set<string>;
  selectedTaskId: string | null;
  inspectorOpen: boolean;
};
export type StoredPortfolioViewState = {
  focusedTaskId: string;
  view: Omit<PortfolioViewState, "expandedProjects" | "expandedTasks"> & {
    expandedProjects: string[];
    expandedTasks: string[];
  };
};

export type EmbeddedProjectPlanner = {
  projectId: string;
  draftTask: PortfolioTask;
  onDraftDatesChange: (dates: { startDate: string; dueDate: string }) => void;
  onRefresh: () => Promise<void>;
};

/** Shorthand for a React state setter passed between the portfolio hooks and components. */
export type SetState<T> = Dispatch<SetStateAction<T>>;
