// "Waiting for …" / "Blocks …" badges in the project header. Late predecessors
// turn red. Used by the project page.
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowRight, Hourglass } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DependencyBadges } from "../dependency-badges";
import { ProjectChip } from "./project-chip";

export async function ProjectDependencyBadges({ badges }: { badges: DependencyBadges }) {
  if (badges.waitingFor.length === 0 && badges.blocks.length === 0) return null;
  const t = await getTranslations("projectLinks.dependencies");
  const format = await getFormatter();
  const date = (value: string) => format.dateTime(new Date(`${value}T00:00:00`), { day: "numeric", month: "short" });

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label={t("label")}>
      {badges.waitingFor.map((wait) => (
        <span
          key={wait.key}
          title={wait.via ? t("viaTask", { title: wait.via }) : undefined}
          className={cn(
            "inline-flex h-7 max-w-full min-w-0 items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-2 text-xs",
            wait.late
              ? "border-destructive/40 bg-destructive/5 text-destructive"
              : "border-amber-300/70 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-200",
          )}
        >
          <Hourglass className="size-3.5 shrink-0" />
          <span className="shrink-0">{t("waitingFor")}</span>
          {wait.task ? (
            <>
              <Link
                href={wait.project ? `/projects/${encodeURIComponent(wait.project.id)}?task=${encodeURIComponent(wait.task.id)}` : `/?task=${encodeURIComponent(wait.task.id)}`}
                className="min-w-0 truncate font-medium underline-offset-2 hover:underline"
              >
                {wait.task.title}
              </Link>
              {wait.project && <ProjectChip project={wait.project} size="xs" />}
            </>
          ) : (
            wait.project && <ProjectChip project={wait.project} size="xs" />
          )}
          {wait.dueDate && <span className="shrink-0 tabular-nums">· {date(wait.dueDate)}</span>}
          {wait.late && <span className="shrink-0 font-semibold">· {t("late")}</span>}
        </span>
      ))}
      {badges.blocks.length > 0 && (
        <span className="inline-flex h-7 max-w-full min-w-0 items-center gap-1.5 rounded-full border bg-background py-0.5 pr-1 pl-2 text-xs text-muted-foreground">
          <ArrowRight className="size-3.5 shrink-0" />
          <span className="shrink-0">{t("blocks", { count: badges.blocks.length })}</span>
          {badges.blocks.map((block) => (
            <span key={block.project.id} title={block.via ? t("viaTask", { title: block.via }) : undefined} className="min-w-0">
              <ProjectChip project={block.project} size="xs" />
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
