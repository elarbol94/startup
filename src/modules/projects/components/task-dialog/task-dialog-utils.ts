// Localized message for a failed task-dialog action (save, move to a project, link).
// Used by task-dialog.tsx and use-task-links.ts.
import type { useTranslations } from "next-intl";
import type { FailureCode } from "./task-dialog-types";

export function failureMessage(
  t: ReturnType<typeof useTranslations<"projects">>,
  tCommon: ReturnType<typeof useTranslations<"common">>,
  code: FailureCode,
): string {
  switch (code) {
    case "dates_together":
      return t("datesTogether");
    case "due_before_start":
      return t("dateOrderInvalid");
    case "constraint_date_required":
      return t("constraintDateRequired");
    case "subtasks_open":
      return t("completeSubtasksFirst");
    case "dependency_cycle":
      return t("dependencyCycle");
    case "dependency_hierarchy":
      return t("dependencyHierarchy");
    case "project_archived":
      return t("taskMoveArchived");
    case "project_without_columns":
      return t("taskMoveNoColumns");
    default:
      return tCommon("error");
  }
}
