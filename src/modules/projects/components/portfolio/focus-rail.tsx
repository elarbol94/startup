// Focus-mode rail above the Gantt: breadcrumb, external dependency jumps and view controls
// for a focused task subtree. Used by portfolio-client.tsx.
"use client";

import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Copy,
  GitBranch,
  LocateFixed,
  Minimize2,
} from "lucide-react";
import type {
  PortfolioSchedule,
  PortfolioTask,
} from "@/modules/projects/queries";
import type {
  FocusDependencyClassification,
  FocusedTaskSubtree,
} from "@/modules/projects/focus";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { PortfolioDependency, SetState, Zoom } from "./portfolio-types";
import type { usePortfolioFocus } from "./use-portfolio-focus";
import type { useTimelineLayout } from "./use-timeline-layout";

export function FocusRail({
  focusedTask,
  focusedProject,
  focusedSubtree,
  focusDependencies,
  schedule,
  enterTaskFocus,
  exitTaskFocus,
  copyFocusLink,
  fitTimelineView,
  scrollToToday,
  zoom,
  setTimelineZoom,
  criticalVisible,
  setCriticalVisible,
}: Pick<
  ReturnType<typeof usePortfolioFocus>,
  "enterTaskFocus" | "exitTaskFocus" | "copyFocusLink"
> &
  Pick<ReturnType<typeof useTimelineLayout>, "fitTimelineView" | "scrollToToday"> & {
    focusedTask: PortfolioTask;
    focusedProject: PortfolioSchedule["projects"][number];
    focusedSubtree: FocusedTaskSubtree<PortfolioTask> | null;
    focusDependencies: FocusDependencyClassification<PortfolioDependency>;
    schedule: PortfolioSchedule;
    zoom: Zoom;
    setTimelineZoom: (nextZoom: Zoom) => void;
    criticalVisible: boolean;
    setCriticalVisible: SetState<boolean>;
  }) {
  const t = useTranslations("projects");
  const focusBreadcrumbs = focusedSubtree && focusedProject
    ? [
        { id: focusedProject.id, label: focusedProject.name },
        ...focusedSubtree.ancestors.map((task) => ({ id: task.id, label: task.title })),
        { id: focusedSubtree.root.id, label: focusedSubtree.root.title },
      ]
    : [];
  const incomingExternalTasks = focusDependencies.incomingExternal
    .map((dependency) =>
      schedule.tasks.find(
        (task) => task.id === dependency.predecessorTaskId,
      ),
    )
    .filter((task): task is PortfolioTask => Boolean(task));
  const outgoingExternalTasks = focusDependencies.outgoingExternal
    .map((dependency) =>
      schedule.tasks.find((task) => task.id === dependency.successorTaskId),
    )
    .filter((task): task is PortfolioTask => Boolean(task));
  return (
    <section
      className="relative overflow-hidden rounded-xl border bg-card shadow-xs"
      aria-label={t("focusMode")}
      data-testid="gantt-focus-rail"
    >
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: focusedProject.color }}
        aria-hidden
      />
      <div className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 pl-4">
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={exitTaskFocus}
          aria-label={t("exitFocus")}
          title={t("exitFocus")}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-[14rem] flex-1">
          <nav
            className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground"
            aria-label={t("taskBreadcrumb")}
          >
            {focusBreadcrumbs.map((item, index) => (
              <span key={`${item.id}-${index}`} className="contents">
                {index > 0 && <ChevronRight className="size-3 shrink-0" aria-hidden />}
                <span
                  className={cn(
                    "truncate",
                    index === focusBreadcrumbs.length - 1 &&
                      "font-medium text-foreground",
                  )}
                >
                  {item.label}
                </span>
              </span>
            ))}
          </nav>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <strong className="truncate text-sm font-semibold">
              {focusedTask.title}
            </strong>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {focusedTask.progress}%
              {focusedTask.startDate && focusedTask.dueDate
                ? ` · ${focusedTask.startDate} – ${focusedTask.dueDate}`
                : ` · ${t("unscheduled")}`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {incomingExternalTasks.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" size="xs">
                    <ArrowRight className="size-3" />
                    {t("incomingDependencies", {
                      count: incomingExternalTasks.length,
                    })}
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-64">
                {incomingExternalTasks.map((task) => (
                  <DropdownMenuItem
                    key={task.id}
                    onClick={() => enterTaskFocus(task)}
                  >
                    <ArrowRight className="size-3.5" />
                    <span className="min-w-0 flex-1 truncate">{task.title}</span>
                    <DropdownMenuShortcut>{t("jumpToTask")}</DropdownMenuShortcut>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {outgoingExternalTasks.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" size="xs">
                    <ArrowLeft className="size-3" />
                    {t("outgoingDependencies", {
                      count: outgoingExternalTasks.length,
                    })}
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-64">
                {outgoingExternalTasks.map((task) => (
                  <DropdownMenuItem
                    key={task.id}
                    onClick={() => enterTaskFocus(task)}
                  >
                    <ArrowLeft className="size-3.5" />
                    <span className="min-w-0 flex-1 truncate">{task.title}</span>
                    <DropdownMenuShortcut>{t("jumpToTask")}</DropdownMenuShortcut>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button size="icon-sm" variant="ghost" onClick={copyFocusLink} aria-label={t("copyFocusLink")} title={t("copyFocusLink")}><Copy className="size-4" /></Button>
          <Button size="sm" variant="outline" className="hidden md:inline-flex" onClick={fitTimelineView}><Minimize2 className="size-4" />{t("fitView")}</Button>
          <Button size="icon-sm" variant="ghost" className="hidden md:inline-flex" onClick={scrollToToday} aria-label={t("today")} title={t("today")}><LocateFixed className="size-4" /></Button>
          <div className="hidden rounded-md border p-0.5 md:flex">
            {(["week", "month", "quarter"] as const).map((option) => (
              <Button
                key={option}
                size="xs"
                variant={zoom === option ? "secondary" : "ghost"}
                onClick={() => setTimelineZoom(option)}
              >
                {t(option)}
              </Button>
            ))}
          </div>
          <Button
            size="icon-sm"
            variant={criticalVisible ? "secondary" : "ghost"}
            className="hidden md:inline-flex"
            onClick={() => setCriticalVisible((value) => !value)}
            aria-label={t("criticalPath")}
            title={t("criticalPath")}
          >
            <GitBranch className="size-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}
