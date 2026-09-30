// Dependency type label keys and draft validation for the portfolio Gantt timeline.
// Used by the dependency editor, schedule inspector and dependency hooks in components/portfolio/.
import type { PortfolioTask } from "@/modules/projects/queries";
import {
  assertDependencyEndpoints,
  hasScheduleCycle,
  type DependencyType,
} from "@/modules/projects/schedule";
import type { DependencyDraft, PortfolioDependency } from "./portfolio-types";

export function dependencyTypeTranslationKey(type: DependencyType) {
  switch (type) {
    case "start_to_start":
      return "dependencyTypeStartStart" as const;
    case "finish_to_finish":
      return "dependencyTypeFinishFinish" as const;
    case "start_to_finish":
      return "dependencyTypeStartFinish" as const;
    default:
      return "dependencyTypeFinishStart" as const;
  }
}

export function dependencyTypeHintKey(type: DependencyType) {
  switch (type) {
    case "start_to_start":
      return "dependencyTypeStartStartHint" as const;
    case "finish_to_finish":
      return "dependencyTypeFinishFinishHint" as const;
    case "start_to_finish":
      return "dependencyTypeStartFinishHint" as const;
    default:
      return "dependencyTypeFinishStartHint" as const;
  }
}

export function dependencyTypeCodeKey(type: DependencyType) {
  switch (type) {
    case "start_to_start":
      return "dependencyTypeStartStartCode" as const;
    case "finish_to_finish":
      return "dependencyTypeFinishFinishCode" as const;
    case "start_to_finish":
      return "dependencyTypeStartFinishCode" as const;
    default:
      return "dependencyTypeFinishStartCode" as const;
  }
}

export function dependencyDraftIsInvalid(
  tasks: PortfolioTask[],
  dependencies: PortfolioDependency[],
  draft: DependencyDraft,
) {
  try {
    assertDependencyEndpoints(tasks, draft);
    const candidate = draft.isNew
      ? [...dependencies, draft]
      : dependencies.map((dependency) =>
          dependency.id === draft.id ? draft : dependency,
        );
    return hasScheduleCycle(tasks, candidate);
  } catch {
    return true;
  }
}
