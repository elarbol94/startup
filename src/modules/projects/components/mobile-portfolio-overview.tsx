"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { AlertTriangle, CalendarClock, ChevronRight, Diamond } from "lucide-react";
import { UserIdentity } from "@/components/user-identity";
import { cn } from "@/lib/utils";
import type { PortfolioSchedule, PortfolioTask } from "@/modules/projects/queries";
import { leafTasks, weightedProgress } from "@/modules/projects/schedule";
import { isTaskDone, projectScheduleRisk } from "@/modules/projects/schedule/project-risk";
import { isDeadlineOverdue, localDateValue } from "@/modules/tasks/deadline-utils";
import { withWorkItemFocus } from "@/modules/context/routes";

type Project = PortfolioSchedule["projects"][number];
type Deadline = PortfolioSchedule["deadlines"][number];

export type ProjectHealthSummary = {
  overdueTasks: number;
  plannedEnd: string | null;
  lateFinish: boolean;
  atRisk: boolean;
};

/** Why a project counts as "at risk" — mirrors the Gantt's project risk rule. */
export function projectHealthSummary(project: Project, tasks: PortfolioTask[], today: string): ProjectHealthSummary {
  const leaves = leafTasks(tasks);
  const overdueTasks = leaves.filter((task) => !isTaskDone(task) && task.dueDate && task.dueDate < today).length;
  const plannedEnd = leaves.reduce<string | null>((latest, task) => (task.dueDate && (!latest || task.dueDate > latest) ? task.dueDate : latest), null);
  const lateFinish = Boolean(project.targetEndDate && plannedEnd && plannedEnd > project.targetEndDate);
  // Use the shared rule so the cards agree with the page header and the Gantt.
  return { overdueTasks, plannedEnd, lateFinish, atRisk: projectScheduleRisk(project, tasks, today) };
}

/** Splits deadlines into overdue (oldest first) and upcoming (soonest first); completed ones are dropped. */
export function splitDeadlines<T extends Pick<Deadline, "dueDate" | "deadlineAt" | "status">>(deadlines: T[], now: Date) {
  const key = (deadline: T) => deadline.deadlineAt ?? `${deadline.dueDate ?? "9999-12-31"}T23:59`;
  const open = deadlines.filter((deadline) => deadline.status !== "done" && deadline.dueDate);
  const overdue: T[] = [];
  const upcoming: T[] = [];
  for (const deadline of open) {
    (isDeadlineOverdue({ deadlineDate: deadline.dueDate!, deadlineAt: deadline.deadlineAt, status: deadline.status }, now) ? overdue : upcoming).push(deadline);
  }
  const byDate = (a: T, b: T) => key(a).localeCompare(key(b));
  return { overdue: overdue.sort(byDate), upcoming: upcoming.sort(byDate) };
}

export function deadlineHref(deadline: Pick<Deadline, "id" | "contextRoute">) {
  return withWorkItemFocus(deadline.contextRoute || "/", deadline.id, "deadline");
}

/**
 * Phone replacement for the Gantt chart: one card per project (status, why it
 * is at risk, progress, people, next date) followed by overdue / upcoming
 * deadlines.
 */
export function MobilePortfolioOverview({
  projects,
  tasksByProject,
  deadlines,
  today,
  now,
}: {
  projects: Project[];
  tasksByProject: Map<string, PortfolioTask[]>;
  deadlines: Deadline[];
  today: string;
  now: Date;
}) {
  const t = useTranslations("projects");
  const tDeadlines = useTranslations("deadlines");
  const format = useFormatter();
  const shortDate = (value: string) => {
    const date = localDateValue(value);
    return date ? format.dateTime(date, { day: "2-digit", month: "short" }) : value;
  };
  const deadlineLabel = (deadline: Deadline) => {
    if (deadline.deadlineAt) return format.dateTime(new Date(deadline.deadlineAt), { dateStyle: "medium", timeStyle: "short" });
    const date = localDateValue(deadline.dueDate ?? "");
    return `${date ? format.dateTime(date, { dateStyle: "medium" }) : deadline.dueDate} · ${tDeadlines("allDay")}`;
  };
  const { overdue, upcoming } = splitDeadlines(deadlines, now);

  return (
    <div className="grid gap-5 md:hidden" data-testid="mobile-portfolio">
      <section aria-labelledby="mobile-projects-heading" className="grid gap-2">
        <h2 id="mobile-projects-heading" className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          {t("mobileProjectsHeading")} <span className="font-mono tabular-nums">({projects.length})</span>
        </h2>
        {projects.length === 0 && (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{t("mobileNoProjects")}</p>
        )}
        {projects.map((project) => {
          const tasks = tasksByProject.get(project.id) ?? [];
          const health = projectHealthSummary(project, tasks, today);
          const progress = weightedProgress(leafTasks(tasks));
          const assigneeIds = [...new Set(tasks.flatMap((task) => task.assigneeIds))].filter((id) => id !== project.managerId).slice(0, 4);
          const next = tasks
            .filter((task) => task.progress < 100 && task.dueDate && task.dueDate >= today)
            .sort((a, b) => Number(b.isMilestone) - Number(a.isMilestone) || (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))[0];
          return (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              aria-label={t("openProjectPage", { name: project.name })}
              className={cn(
                "grid gap-2.5 rounded-lg border border-l-4 bg-card p-3 text-left transition-colors hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-ring",
              )}
              style={{ borderLeftColor: project.color }}
            >
              <div className="flex items-start gap-2">
                <span className="min-w-0 flex-1 text-sm leading-snug font-semibold">{project.name}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                    health.atRisk
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                      : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
                  )}
                >
                  {health.atRisk ? t("atRisk") : t("onTrack")}
                </span>
                <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              </div>
              {health.atRisk && (
                <ul className="grid gap-0.5 text-xs text-amber-800 dark:text-amber-300">
                  {health.overdueTasks > 0 && (
                    <li className="flex items-center gap-1.5"><AlertTriangle className="size-3.5 shrink-0" aria-hidden />{t("riskOverdueTasks", { count: health.overdueTasks })}</li>
                  )}
                  {health.lateFinish && health.plannedEnd && project.targetEndDate && (
                    <li className="flex items-center gap-1.5"><AlertTriangle className="size-3.5 shrink-0" aria-hidden />{t("riskLateFinish", { planned: shortDate(health.plannedEnd), target: shortDate(project.targetEndDate) })}</li>
                  )}
                </ul>
              )}
              <div className="flex items-center gap-2" aria-label={`${t("progress")}: ${progress}%`}>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className="h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: project.color }} />
                </div>
                <span className="w-9 text-right font-mono text-xs tabular-nums text-muted-foreground">{progress}%</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                <span className="flex min-w-0 items-center gap-2">
                  {project.managerId ? <UserIdentity userId={project.managerId} compact className="max-w-36 text-foreground" /> : <span>{t("noManager")}</span>}
                  {assigneeIds.length > 0 && (
                    <span className="flex items-center gap-0.5">{assigneeIds.map((id) => <UserIdentity key={id} userId={id} avatarOnly compact />)}</span>
                  )}
                </span>
                <span className="flex min-w-0 items-center gap-1">
                  {next?.isMilestone ? <Diamond className="size-3 shrink-0 fill-indigo-500 text-indigo-600" aria-hidden /> : <CalendarClock className="size-3 shrink-0" aria-hidden />}
                  {next ? (
                    <span className="truncate"><span className="sr-only">{t("nextUp")}: </span><span className="font-medium text-foreground">{shortDate(next.dueDate!)}</span> · {next.title}</span>
                  ) : project.targetEndDate ? (
                    <span>{t("targetEnd")}: {shortDate(project.targetEndDate)}</span>
                  ) : (
                    <span>{t("nothingScheduled")}</span>
                  )}
                </span>
              </div>
            </Link>
          );
        })}
      </section>

      {(overdue.length > 0 || upcoming.length > 0) && (
        <section aria-labelledby="mobile-deadlines-heading" className="grid gap-3">
          <h2 id="mobile-deadlines-heading" className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            {t("mobileDeadlinesHeading")}
          </h2>
          {overdue.length > 0 && (
            <DeadlineGroup title={t("deadlinesOverdue")} tone="overdue" deadlines={overdue} label={deadlineLabel} overdueTag={t("overdueTag")} />
          )}
          {upcoming.length > 0 ? (
            <DeadlineGroup title={t("deadlinesUpcoming")} tone="upcoming" deadlines={upcoming} label={deadlineLabel} overdueTag={t("overdueTag")} />
          ) : (
            <p className="text-xs text-muted-foreground">{t("noUpcomingDeadlines")}</p>
          )}
        </section>
      )}
    </div>
  );
}

function DeadlineGroup({
  title,
  tone,
  deadlines,
  label,
  overdueTag,
}: {
  title: string;
  tone: "overdue" | "upcoming";
  deadlines: Deadline[];
  label: (deadline: Deadline) => string;
  overdueTag: string;
}) {
  const overdue = tone === "overdue";
  return (
    <div className="grid gap-1.5">
      <h3 className={cn("text-sm font-medium", overdue && "text-red-700 dark:text-red-400")}>
        {title} <span className="font-mono text-xs tabular-nums">({deadlines.length})</span>
      </h3>
      <ul className="grid gap-1.5">
        {deadlines.map((deadline) => (
          <li key={deadline.id}>
            <Link
              href={deadlineHref(deadline)}
              className={cn(
                "grid grid-cols-[auto_1fr] items-center gap-3 rounded-lg border p-3 text-left focus-visible:outline-2 focus-visible:outline-ring",
                overdue
                  ? "border-red-300 bg-red-50/60 dark:border-red-900/70 dark:bg-red-950/20"
                  : "bg-card",
              )}
            >
              <Diamond className={cn("size-4", overdue ? "fill-red-500 text-red-600" : "fill-amber-500 text-amber-600")} aria-hidden />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{deadline.title}</span>
                <span className="flex flex-wrap items-center gap-x-2 text-xs">
                  <span className={overdue ? "font-medium text-red-700 dark:text-red-400" : "text-muted-foreground"}>{label(deadline)}</span>
                  {overdue && (
                    <span className="rounded-sm bg-red-600 px-1.5 py-px text-[10px] font-semibold tracking-wide text-white uppercase">{overdueTag}</span>
                  )}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
