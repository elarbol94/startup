// Pure project scheduling library (calendar-day dates, task trees, dependencies,
// cascades, portfolio edit previews, project risk and project-link cascades).
// The implementation lives in ./schedule/; this file keeps the public import path
// "@/modules/projects/schedule".

export type {
  ScheduleConstraintType,
  ScheduleTask,
  ScheduleRollup,
  DependencyType,
  ScheduleDependency,
  ScheduleChange,
  ScheduleEntityType,
  ScheduleOperation,
  ScheduleEdit,
  SchedulePortfolioTask,
  ScheduleProject,
  ScheduleChangeCause,
  ScheduleEntityChange,
  ScheduleImpact,
  SchedulePreview,
  SchedulePlanInput,
  ScheduleContainmentViolation,
  TaskTreeNode,
  TaskSubtree,
  AncestorExpansion,
  PlacementSuggestion,
  ScheduleConstraint,
} from "./schedule/schedule-types";
export {
  DEPENDENCY_TYPES,
} from "./schedule/schedule-types";
export {
  addCalendarDays,
  calendarDaysInclusive,
  dueDateForDuration,
  calendarDayDistance,
  inferScheduleEditOperation,
} from "./schedule/date-math";
export {
  taskChildren,
  buildTaskForest,
  taskDescendants,
  taskAncestors,
  taskDepth,
  taskSubtree,
  leafTasks,
  indentTarget,
  outdentTarget,
  assertTaskHierarchy,
} from "./schedule/task-tree";
export {
  weightedProgress,
  shiftScheduledTasks,
  descendantEnvelope,
  scheduleContainmentViolations,
  expandContainerEnvelope,
  rollupEnvelope,
  containerOverflow,
  suggestTaskPlacement,
  rollupTaskSchedule,
} from "./schedule/container-rollups";
export {
  dependencyStartDate,
  dependencyTypeOf,
  dependencyEndpoints,
  dependencyRequiredDate,
  hasScheduleCycle,
  assertDependencyEndpoints,
  dependencyConflicts,
  dependencyConflictEdgeKeys,
  criticalPathTaskIds,
} from "./schedule/dependency-graph";
export {
  previewScheduleCascade,
} from "./schedule/cascade-planner";
export {
  previewScheduleEdit,
} from "./schedule/edit-preview";
export {
  isTaskDone,
  projectScheduleRisk,
} from "./schedule/project-risk";
export type { ProjectScheduleLink } from "./schedule/project-link-cascade";
export {
  applyProjectLinkCascade,
} from "./schedule/project-link-cascade";
