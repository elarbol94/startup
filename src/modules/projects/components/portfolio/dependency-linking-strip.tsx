// Status strip shown while a dependency link is being drawn from a task bar.
// Used by portfolio-client.tsx.
"use client";

import { useTranslations } from "next-intl";
import { GitBranch } from "lucide-react";
import type { PortfolioSchedule } from "@/modules/projects/queries";
import { Button } from "@/components/ui/button";
import type { SetState } from "./portfolio-types";

export function DependencyLinkingStrip({
  dependencySourceId,
  schedule,
  setDependencySourceId,
  setDependencyHoverId,
}: {
  dependencySourceId: string;
  schedule: PortfolioSchedule;
  setDependencySourceId: SetState<string | null>;
  setDependencyHoverId: SetState<string | null>;
}) {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  return (
    <div
      className="flex min-h-9 items-center gap-2 border-b border-indigo-200 bg-indigo-50/90 px-3 text-xs text-indigo-950 dark:border-indigo-900 dark:bg-indigo-950/35 dark:text-indigo-100"
      role="status"
      aria-live="polite"
      data-testid="dependency-linking-strip"
    >
      <GitBranch className="size-3.5 text-indigo-600 dark:text-indigo-400" />
      <span className="font-medium">
        {t("dependencyLinkingSource", {
          name:
            schedule.tasks.find(
              (task) => task.id === dependencySourceId,
            )?.title ?? "",
        })}
      </span>
      <span className="text-indigo-700/80 dark:text-indigo-300/80">
        {t("dependencyLinkingHint")}
      </span>
      <Button
        type="button"
        size="xs"
        variant="ghost"
        className="ml-auto"
        onClick={() => {
          setDependencySourceId(null);
          setDependencyHoverId(null);
        }}
      >
        {tCommon("cancel")}
      </Button>
    </div>
  );
}
