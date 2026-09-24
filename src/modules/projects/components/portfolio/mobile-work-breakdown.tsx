// Card list of deadlines and tasks that replaces the Gantt on small screens.
// Used by portfolio-client.tsx.
"use client";

import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Diamond } from "lucide-react";
import type {
  PortfolioSchedule,
  PortfolioTask,
} from "@/modules/projects/queries";
import { cn } from "@/lib/utils";
import { localDateValue } from "@/modules/tasks/deadline-utils";
import { withWorkItemFocus } from "@/modules/context/routes";
import type { EmbeddedProjectPlanner, Row } from "./portfolio-types";
import type { useBarDrag } from "./use-bar-drag";
import type { useTaskTreeActions } from "./use-task-tree-actions";

export function MobileWorkBreakdown({
  embedded,
  focusedTask,
  schedule,
  rows,
  expandedTasks,
  selectedTaskId,
  openTask,
  handleTaskScheduleKey,
}: Pick<ReturnType<typeof useTaskTreeActions>, "openTask"> &
  Pick<ReturnType<typeof useBarDrag>, "handleTaskScheduleKey"> & {
    embedded?: EmbeddedProjectPlanner;
    focusedTask: PortfolioTask | null;
    schedule: PortfolioSchedule;
    rows: Row[];
    expandedTasks: Set<string>;
    selectedTaskId: string | null;
  }) {
  const t = useTranslations("projects");
  const tDeadlines = useTranslations("deadlines");
  const format = useFormatter();
  const router = useRouter();
  return (
    <div className={embedded ? "hidden" : "grid gap-2 p-2 md:hidden"} role="tree" aria-label={t("workBreakdown")}>
      {!focusedTask && schedule.deadlines.map((deadline) => {
        const href = withWorkItemFocus(deadline.contextRoute || "/", deadline.id, "deadline");
        const localDate = localDateValue(deadline.dueDate ?? "");
        const deadlineLabel = deadline.deadlineAt
          ? format.dateTime(new Date(deadline.deadlineAt), { dateStyle: "medium", timeStyle: "short" })
          : `${localDate ? format.dateTime(localDate, { dateStyle: "medium" }) : deadline.dueDate} · ${tDeadlines("allDay")}`;
        return (
          <button
            key={deadline.id}
            type="button"
            onClick={() => router.push(href)}
            className="grid grid-cols-[auto_1fr] items-center gap-3 rounded-lg border border-amber-300 bg-amber-50/50 p-3 text-left dark:border-amber-800 dark:bg-amber-950/20"
          >
            <Diamond className="size-4 rotate-45 fill-amber-500 text-amber-600" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{deadline.title}</span>
              <span className="block text-xs text-muted-foreground">{deadlineLabel}</span>
            </span>
          </button>
        );
      })}
      {rows.filter((row) => row.kind === "task" || row.kind === "subtask").map((row) => (
        <button
          key={row.id}
          type="button"
          role="treeitem"
          aria-level={(row.depth ?? 0) + 1}
          aria-expanded={row.isSummary ? expandedTasks.has(row.id) : undefined}
          aria-selected={selectedTaskId === row.task?.id}
          aria-current={selectedTaskId === row.task?.id ? "true" : undefined}
          onClick={() => row.task && openTask(row.task)}
          onKeyDown={(event) => handleTaskScheduleKey(event, row)}
          className={cn(
            "grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border bg-card p-3 text-left",
            row.kind === "subtask" && "border-l-2 border-l-indigo-400",
            selectedTaskId === row.task?.id && "outline-2 outline-indigo-600",
          )}
          style={{ marginLeft: Math.min(row.depth ?? 0, 6) * 16 }}
        >
          {row.isMilestone ? <Diamond className="size-4 fill-indigo-500 text-indigo-600" /> : <span className="size-2.5 rounded-full" style={{ backgroundColor: row.color }} />}
          <span className="min-w-0"><span className="block truncate text-sm font-medium">{row.label}</span><span className="block text-xs text-muted-foreground">{row.startDate ?? t("unscheduled")}{row.dueDate && !row.isMilestone ? ` – ${row.dueDate}` : ""}</span></span>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">{row.progress}%</span>
        </button>
      ))}
    </div>
  );
}
