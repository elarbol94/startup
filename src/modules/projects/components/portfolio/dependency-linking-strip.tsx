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
      className="flex min-h-9 items-center gap-2 border-b border-line-soft bg-brand-soft px-[18px] text-xs text-foreground"
      role="status"
      aria-live="polite"
      data-testid="dependency-linking-strip"
    >
      <GitBranch className="size-3.5 text-brand-ink" />
      <span className="font-medium">
        {t("dependencyLinkingSource", {
          name:
            schedule.tasks.find(
              (task) => task.id === dependencySourceId,
            )?.title ?? "",
        })}
      </span>
      <span className="text-text-secondary">
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
