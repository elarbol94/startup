// Shared types and dependency-type constants for the project scheduling library.
// Used by the other files in schedule/ and re-exported from ../schedule.ts.

/**
 * How a task reacts when one of its predecessors moves.
 *
 * - `asap` follows the predecessor in both directions: it is pulled earlier as
 *   well as pushed later.
 * - `start_no_earlier_than` treats `constraintDate` as a floor, so the task is
 *   pushed later but never pulled back before that date.
 * - `must_start_on` pins the task to `constraintDate` regardless of its
 *   predecessors; the resulting overlap surfaces as a dependency conflict.
 */
export type ScheduleConstraintType =
  | "asap"
  | "start_no_earlier_than"
  | "must_start_on";

export type ScheduleTask = {
  id: string;
  parentTaskId?: string | null;
  startDate: string | null;
  dueDate: string | null;
  progress?: number;
  isMilestone?: boolean;
  constraintType?: ScheduleConstraintType | null;
  constraintDate?: string | null;
};

export type ScheduleRollup = {
  startDate: string | null;
  dueDate: string | null;
  progress: number;
  unscheduledCount: number;
};

export const DEPENDENCY_TYPES = [
  "finish_to_start",
  "start_to_start",
  "finish_to_finish",
  "start_to_finish",
] as const;

export type DependencyType = (typeof DEPENDENCY_TYPES)[number];

export type ScheduleDependency = {
  id?: string;
  predecessorTaskId: string;
  successorTaskId: string;
  dependencyType: DependencyType;
  lagDays: number;
};

export type ScheduleDependencyLike = Omit<ScheduleDependency, "dependencyType"> & {
  dependencyType?: DependencyType;
};

export type ScheduleChange = {
  taskId: string;
  beforeStartDate: string | null;
  beforeDueDate: string | null;
  afterStartDate: string | null;
  afterDueDate: string | null;
};

export type ScheduleEntityType = "task" | "project";

export type ScheduleOperation =
  | "move"
  | "resize-start"
  | "resize-end"
  | "place"
  | "fit";

/**
 * A user-authored scheduling intent. Dates are omitted for `fit`, where the
 * descendant envelope is the requested result.
 */
export type ScheduleEdit = {
  entityType: ScheduleEntityType;
  entityId: string;
  operation: ScheduleOperation;
  startDate?: string | null;
  dueDate?: string | null;
};

export type SchedulePortfolioTask = ScheduleTask & {
  projectId: string;
};

export type ScheduleProject = {
  id: string;
  startDate: string | null;
  dueDate: string | null;
};

export type ScheduleChangeCause =
  | "direct"
  | "fit"
  | "subtree"
  | "dependency"
  | "ancestor-expansion";

export type ScheduleEntityChange = {
  entityType: ScheduleEntityType;
  entityId: string;
  beforeStartDate: string | null;
  beforeDueDate: string | null;
  afterStartDate: string | null;
  afterDueDate: string | null;
  cause: ScheduleChangeCause;
  title?: string;
};

export type ScheduleImpact = {
  dayDelta: number;
  affectedTaskCount: number;
  affectedProjectCount: number;
  expandedTaskCount: number;
  expandedProjectCount: number;
  conflictTaskIds: string[];
};

export type SchedulePreview = {
  edit: ScheduleEdit;
  changes: ScheduleEntityChange[];
  impact: ScheduleImpact;
  constraints: ScheduleConstraint[];
};

export type SchedulePlanInput = {
  tasks: SchedulePortfolioTask[];
  projects: ScheduleProject[];
  dependencies: ScheduleDependency[];
  edit: ScheduleEdit;
};

export type ScheduleContainmentViolation = {
  entityType: ScheduleEntityType;
  entityId: string;
  violatesStart: boolean;
  violatesEnd: boolean;
  constrainingTaskIds: string[];
};

export type TaskTreeNode<T> = T & {
  depth: number;
  children: TaskTreeNode<T>[];
};

export type TaskSubtree<T> = {
  root: T;
  descendants: T[];
  leaves: T[];
};

export type AncestorExpansion = {
  taskId: string;
  startDate: string | null;
  dueDate: string | null;
  expandedStart: boolean;
  expandedEnd: boolean;
};

export type PlacementSuggestion = {
  startDate: string;
  dueDate: string;
  expandsAncestors: boolean;
  reason: "free-gap" | "after-siblings" | "near-today";
};

export type ScheduleConstraint = {
  entityType?: ScheduleEntityType;
  entityId?: string;
  startDate: string | null;
  dueDate: string | null;
  clampedStart: boolean;
  clampedEnd: boolean;
  requestedStartDate?: string | null;
  requestedDueDate?: string | null;
  constrainingTaskIds?: string[];
};
