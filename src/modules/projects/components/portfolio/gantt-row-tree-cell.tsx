// Work-breakdown (left, sticky) cell of a portfolio Gantt row: drag grip, expand toggles,
// label, assignees, health markers and the project/task action menus. Used by gantt-row.tsx.
"use client";

import { UserIdentity } from "@/components/user-identity";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  Archive,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Diamond,
  Ellipsis,
  FolderKanban,
  Focus,
  GitBranch,
  GripVertical,
  IndentDecrease,
  IndentIncrease,
  Minimize2,
  PanelRightClose,
  Pencil,
  Plus,
  ScanSearch,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { fitProjectToTasks } from "@/modules/projects/schedule-change-actions";
import type { PortfolioSchedule } from "@/modules/projects/queries";
import { indentTarget, isTaskDone } from "@/modules/projects/schedule";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { ProjectDialogState } from "../project-dialog";
import type { EmbeddedProjectPlanner, Row, SetState } from "./portfolio-types";
import { projectRisk } from "./portfolio-utils";
import type { useBarDrag } from "./use-bar-drag";
import type { usePortfolioFocus } from "./use-portfolio-focus";
import type { usePortfolioRows } from "./use-portfolio-rows";
import type { useScheduleCommit } from "./use-schedule-commit";
import type { useStructureDrag } from "./use-structure-drag";
import type { useTaskTreeActions } from "./use-task-tree-actions";
import type { useTimelineLayout } from "./use-timeline-layout";

export type GanttRowTreeCellProps = Pick<
  ReturnType<typeof useStructureDrag>,
  | "structureDrag"
  | "structureDrop"
  | "beginStructureDrag"
  | "updateStructureDrag"
  | "endStructureDrag"
  | "cancelStructureDrag"
  | "structureKey"
  | "insertionIndicatorId"
> &
  Pick<
    ReturnType<typeof useTaskTreeActions>,
    "toggle" | "openTask" | "newTask" | "outdentRow" | "indentRow" | "requestDeleteTask"
  > &
  Pick<ReturnType<typeof usePortfolioRows>, "tasksByProject" | "conflicts"> &
  Pick<ReturnType<typeof useBarDrag>, "handleTaskScheduleKey"> &
  Pick<ReturnType<typeof useScheduleCommit>, "offerScheduleUndo" | "fitTaskDates"> &
  Pick<ReturnType<typeof usePortfolioFocus>, "enterTaskFocus"> &
  Pick<ReturnType<typeof useTimelineLayout>, "focusRowTimeline"> & {
    row: Row;
    project: PortfolioSchedule["projects"][number];
    schedule: PortfolioSchedule;
    structurePending: boolean;
    setProjectDialog: SetState<ProjectDialogState>;
    today: string;
    selectedTaskId: string | null;
    setSelectedTaskId: SetState<string | null>;
    treeWidth: number;
    embedded?: EmbeddedProjectPlanner;
    expandedProjects: Set<string>;
    expandedTasks: Set<string>;
    setExpandedProjects: SetState<Set<string>>;
    setExpandedTasks: SetState<Set<string>>;
    isDraftTask: (id: string) => boolean;
    refreshSchedule: () => Promise<void>;
  };

export function GanttRowTreeCell({
  row,
  project,
  schedule,
  tasksByProject,
  today,
  conflicts,
  structureDrag,
  structureDrop,
  selectedTaskId,
  treeWidth,
  embedded,
  structurePending,
  beginStructureDrag,
  updateStructureDrag,
  endStructureDrag,
  cancelStructureDrag,
  structureKey,
  insertionIndicatorId,
  toggle,
  setExpandedProjects,
  expandedProjects,
  setExpandedTasks,
  expandedTasks,
  openTask,
  isDraftTask,
  setSelectedTaskId,
  handleTaskScheduleKey,
  newTask,
  refreshSchedule,
  offerScheduleUndo,
  fitTaskDates,
  setProjectDialog,
  enterTaskFocus,
  outdentRow,
  indentRow,
  requestDeleteTask,
  focusRowTimeline,
}: GanttRowTreeCellProps) {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  const isRisk = row.kind === "project" && projectRisk(project, tasksByProject.get(project.id) ?? [], today);
  const isConflict = Boolean(row.task && conflicts.has(row.id));
  return (
    <div
      data-structure-row={row.id}
      className={cn(
        "sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r bg-card px-2.5",
        structureDrag?.id === row.id && "opacity-50",
        structureDrop?.row.id === row.id && structureDrop.placement === "inside" && (structureDrop.valid ? "ring-2 ring-inset ring-sky-500 bg-sky-500/10" : "ring-2 ring-inset ring-red-500"),
        row.kind === "project" && "bg-muted font-semibold",
        row.isSummary && row.kind !== "project" && "font-medium",
        row.kind === "subtask" && "bg-card",
        selectedTaskId === row.task?.id &&
          "bg-indigo-50 dark:bg-indigo-950",
      )}
      style={{
        width: treeWidth,
        paddingLeft:
          row.kind === "project"
            ? 10
            : 36 + Math.min(row.depth ?? 0, 10) * 18,
        backgroundImage:
          row.task && (row.depth ?? 0) > 0
            ? `repeating-linear-gradient(to right, transparent 0, transparent 16px, color-mix(in oklab, var(--border) 45%, transparent) 16px, color-mix(in oklab, var(--border) 45%, transparent) 17px, transparent 17px, transparent 18px)`
            : undefined,
        backgroundSize:
          row.task && (row.depth ?? 0) > 0
            ? `${Math.min(row.depth ?? 0, 10) * 18}px 100%`
            : undefined,
      }}
    >
      {!embedded && <button type="button" className="shrink-0 cursor-grab touch-none rounded p-1 text-muted-foreground opacity-50 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 active:cursor-grabbing" aria-label={t("moveRow", { name: row.label })} title={t("moveRowHelp")} disabled={structurePending}
        onPointerDown={event => beginStructureDrag(event, row)} onPointerMove={updateStructureDrag} onPointerUp={endStructureDrag} onPointerCancel={cancelStructureDrag} onLostPointerCapture={cancelStructureDrag} onKeyDown={event => structureKey(event, row)} onClick={event => event.stopPropagation()}><GripVertical className="size-3.5" /></button>}
      {structureDrop && insertionIndicatorId === row.id && <span className={cn("pointer-events-none absolute inset-x-0 z-50 h-[3px]", structureDrop.valid ? "bg-sky-500" : "bg-red-500", structureDrop.placement === "before" ? "top-0" : structureDrop.placement === "after" ? "bottom-0" : "hidden")} />}
      {row.kind === "project" && <Button variant="ghost" size="icon-xs" onClick={() => toggle(setExpandedProjects, row.projectId)} aria-label={t("toggleProject")}>{expandedProjects.has(row.projectId) ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}</Button>}
      {row.task && row.isSummary && <Button variant="ghost" size="icon-xs" onClick={() => toggle(setExpandedTasks, row.id)} aria-label={t("toggleSubtasks")}>{expandedTasks.has(row.id) ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}</Button>}
      {(row.kind === "task" || row.kind === "subtask") && !row.isSummary && (row.isMilestone ? <Diamond className="size-3.5 fill-indigo-500 text-indigo-600" /> : <CircleDot className="size-3.5 text-muted-foreground" />)}
      <button
        type="button"
        onClick={() => row.task ? openTask(row.task) : toggle(setExpandedProjects, row.projectId)}
        onFocus={() => row.task && !isDraftTask(row.task.id) && setSelectedTaskId(row.task.id)}
        onKeyDown={(event) => row.task && handleTaskScheduleKey(event, row)}
        className={cn(
          "min-w-0 flex-1 line-clamp-2 rounded-sm text-left text-sm leading-tight focus-visible:outline-2 focus-visible:outline-ring",
          row.task && "hover:underline",
        )}
        title={row.task?.assigneeName ? `${row.label} · ${row.task.assigneeName}` : row.label}
      >
        {row.label}
      </button>
      {row.kind === "project" && (
        <Link
          href={`/projects/${row.projectId}`}
          aria-label={t("openProjectPage", { name: row.label })}
          title={t("openProjectPage", { name: row.label })}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          onClick={(event) => event.stopPropagation()}
        >
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </Link>
      )}
      {row.task?.assignees.length ? <span className="flex w-12 shrink-0 items-center -space-x-1">{row.task.assignees.slice(0, 2).map(person => <UserIdentity key={person.id} userId={person.id} name={person.name} compact avatarOnly />)}{row.task.assignees.length > 2 && <span className="bg-card text-[10px]">+{row.task.assignees.length - 2}</span>}</span> : null}
      {isRisk && <span tabIndex={0} title={t("projectRiskExplanation")}><AlertTriangle className="size-3.5 text-amber-600" aria-label={t("projectRiskExplanation")} /></span>}
      {isConflict && <span tabIndex={0} title={t(row.task && isTaskDone(row.task) ? "historicalConflict" : "activeConflict")}><GitBranch className={cn("size-3.5 shrink-0", row.task && isTaskDone(row.task) ? "text-muted-foreground" : "text-red-600")} aria-label={t(row.task && isTaskDone(row.task) ? "historicalConflict" : "activeConflict")} /></span>}
      {(() => {
        const hasDates = Boolean(row.startDate && row.dueDate);
        const label = hasDates ? t("showRowTimeline", { name: row.label }) : t("showRowTimelineUnavailable");
        return (
          <span title={label} className="shrink-0">
            <Button
              variant="ghost"
              size="icon-xs"
              className="opacity-30 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 motion-reduce:transition-none"
              disabled={!hasDates}
              aria-label={label}
              onClick={(event) => { event.stopPropagation(); focusRowTimeline(row); }}
            >
              <ScanSearch className="size-3.5" />
            </Button>
          </span>
        );
      })()}
      <span className="w-10 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground">{row.progress}%</span>
      {!embedded && row.kind === "project" && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="opacity-30 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 motion-reduce:transition-none"
                aria-label={t("projectActions", { name: row.label })}
              >
                <Ellipsis className="size-3.5" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => newTask(row.projectId)}>
              <Plus className="size-3.5" />{t("newTask")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={async () => {
                try {
                  const result = await fitProjectToTasks(row.projectId);
                  await refreshSchedule();
                  offerScheduleUndo(result.changeSetId);
                } catch {
                  toast.error(tCommon("error"));
                }
              }}
            >
              <Minimize2 className="size-3.5" />{t("fitToTasks")}
            </DropdownMenuItem>
            <DropdownMenuItem
              render={<a href={`/projects/${row.projectId}`} />}
            >
              <FolderKanban className="size-3.5" />{t("openBoard")}
            </DropdownMenuItem>
            {(() => {
              const project = schedule.projects.find((item) => item.id === row.projectId);
              return project && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setProjectDialog({ kind: "edit", project })}><Pencil className="size-3.5" />{t("editProject")}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setProjectDialog({ kind: "archive", project })}><Archive className="size-3.5" />{t("archive")}</DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => setProjectDialog({ kind: "delete", project })}><Trash2 className="size-3.5" />{t("deleteProject")}</DropdownMenuItem>
                </>
              );
            })()}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {row.task && !isDraftTask(row.task.id) && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="opacity-30 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 motion-reduce:transition-none"
                aria-label={t("taskActions", { name: row.label })}
              >
                <Ellipsis className="size-3.5" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => row.task && openTask(row.task)}>
              <PanelRightClose className="size-3.5" />{t("openDetails")}
            </DropdownMenuItem>
            {!embedded && <DropdownMenuItem onClick={() => row.task && enterTaskFocus(row.task)}>
              <Focus className="size-3.5" />{t("focusTask")}
              <DropdownMenuShortcut>F</DropdownMenuShortcut>
            </DropdownMenuItem>}
            {!embedded && !row.isMilestone && (
              <DropdownMenuItem onClick={() => row.task && newTask(row.projectId, row.task.id)}>
                <Plus className="size-3.5" />{t("newSubtask")}
              </DropdownMenuItem>
            )}
            {row.isSummary && (
              <DropdownMenuItem
                onClick={() => row.task && void fitTaskDates(row.task)}
              >
                <Minimize2 className="size-3.5" />{t("fitToChildren")}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={Boolean(embedded) || !row.task.parentTaskId}
              onClick={() => row.task && outdentRow(row.task)}
            >
              <IndentDecrease className="size-3.5" />{t("outdentTask")}
              <DropdownMenuShortcut>Alt+←</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={Boolean(embedded) || !indentTarget(tasksByProject.get(row.projectId) ?? [], row.task.id)}
              onClick={() => row.task && indentRow(row.task)}
            >
              <IndentIncrease className="size-3.5" />{t("indentTask")}
              <DropdownMenuShortcut>Alt+→</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => row.task && requestDeleteTask(row.task)}
            >
              <Trash2 className="size-3.5" />{tCommon("delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
