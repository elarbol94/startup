// Localized messages for scheduling failure codes returned by the project actions.
// Used by the portfolio hooks and the schedule inspector in components/portfolio/.
import type { useTranslations } from "next-intl";
import type { ScheduleErrorCode } from "@/modules/projects/schedule-errors";

type ProjectsTranslator = ReturnType<typeof useTranslations<"projects">>;

/** Carries an action's failure code through a multi-step commit's catch. */
export class ScheduleCommitError extends Error {
  constructor(readonly code: ScheduleErrorCode) {
    super(code);
  }
}

/**
 * Localized text for an expected scheduling failure. Server actions return a
 * code rather than throwing, because production builds hide error messages.
 */
export function scheduleErrorMessage(
  t: ProjectsTranslator,
  code: ScheduleErrorCode,
  context: "schedule" | "dependency" | "structure" | "undo" | "redo" | "delete",
): string {
  switch (code) {
    case "cycle":
      return context === "dependency"
        ? t("dependencyCycle")
        : context === "structure"
          ? t("structureInvalid")
          : t("scheduleErrorCycle");
    case "hierarchy":
      return context === "dependency" ? t("dependencySaveError") : t("structureInvalid");
    case "stale":
      return t("scheduleChanged");
    case "not-found":
      return t("scheduleErrorNotFound");
    case "invalid":
      return t("scheduleErrorInvalid");
    case "unavailable":
      return context === "redo" ? t("redoUnavailable") : t("undoUnavailable");
    case "blocked":
      return context === "redo" ? t("redoBlocked") : t("undoBlocked");
  }
}
