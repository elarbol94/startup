"use client";

// Board task card with its collapsible, recursive subtask list. Used by
// board/board-column.tsx and the drag overlay in board-client.tsx.
import { UserIdentity } from "@/components/user-identity";
import { useFormatter, useTranslations } from "next-intl";
import {
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Plus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { BoardTaskDto } from "../task-dialog";
import { localDateValue } from "@/modules/tasks/deadline-utils";
import { localDateInZone } from "@/modules/calendar/date-utils";
import type { ColumnDto } from "./board-types";
import { PRIORITY_STYLES, descendantLeaves } from "./board-utils";

function RecursiveTaskRows({
  parentId,
  depth,
  subtasksByParent,
  columns,
  expandedTasks,
  onToggleTask,
  onAddSubtask,
  onEditTask,
}: {
  parentId: string;
  depth: number;
  subtasksByParent: Record<string, BoardTaskDto[]>;
  columns: ColumnDto[];
  expandedTasks: Set<string>;
  onToggleTask: (taskId: string) => void;
  onAddSubtask?: (task: BoardTaskDto) => void;
  onEditTask: (task: BoardTaskDto) => void;
}) {
  const t = useTranslations("projects");
  return (subtasksByParent[parentId] ?? []).map((task) => {
    const children = subtasksByParent[task.id] ?? [];
    const column = columns.find((candidate) => candidate.id === task.columnId);
    const expanded = expandedTasks.has(task.id);
    return (
      <div
        key={task.id}
        data-subtask-id={task.id}
        data-subtask-title={task.title}
        className="border-t border-violet-200/70 dark:border-violet-900"
        style={{ paddingLeft: Math.min(depth, 8) * 14 }}
      >
        <div className="flex items-center gap-1.5 px-2 py-1.5">
          {children.length > 0 ? (
            <button
              type="button"
              className="rounded p-0.5 hover:bg-violet-100 dark:hover:bg-violet-950"
              onClick={(event) => {
                event.stopPropagation();
                onToggleTask(task.id);
              }}
              aria-label={t("toggleSubtasks")}
              aria-expanded={expanded}
            >
              {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            </button>
          ) : (
            <span className={`mx-1 size-1.5 rounded-full ${column?.isCompleted ? "bg-emerald-500" : "bg-violet-400"}`} />
          )}
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left text-xs hover:underline"
            onClick={(event) => {
              event.stopPropagation();
              onEditTask(task);
            }}
          >
            {task.title}
          </button>
          {task.startDate && task.dueDate ? (
            <CalendarDays className="size-3 text-muted-foreground" />
          ) : (
            <AlertTriangle className="size-3 text-amber-600" aria-label={t("unscheduled")} />
          )}
          {!task.isMilestone && onAddSubtask && (
            <button
              type="button"
              className="rounded p-0.5 text-muted-foreground hover:bg-violet-100 hover:text-foreground dark:hover:bg-violet-950"
              onClick={(event) => {
                event.stopPropagation();
                onAddSubtask(task);
              }}
              aria-label={t("newSubtask")}
            >
              <Plus className="size-3" />
            </button>
          )}
        </div>
        {children.length > 0 && expanded && (
          <RecursiveTaskRows
            parentId={task.id}
            depth={depth + 1}
            subtasksByParent={subtasksByParent}
            columns={columns}
            expandedTasks={expandedTasks}
            onToggleTask={onToggleTask}
            onAddSubtask={onAddSubtask}
            onEditTask={onEditTask}
          />
        )}
      </div>
    );
  });
}

export function TaskCard({
  task,
  subtasksByParent = {},
  columns = [],
  onClick,
  onAddSubtask,
  onEditSubtask,
  expanded = false,
  onToggleExpanded,
  expandedTasks = new Set(),
  onToggleTask,
  overlay = false,
}: {
  task: BoardTaskDto;
  subtasksByParent?: Record<string, BoardTaskDto[]>;
  columns?: ColumnDto[];
  onClick?: () => void;
  onAddSubtask?: (task: BoardTaskDto) => void;
  onEditSubtask?: (task: BoardTaskDto) => void;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  expandedTasks?: Set<string>;
  onToggleTask?: (taskId: string) => void;
  overlay?: boolean;
}) {
  const t = useTranslations("projects");
  const format = useFormatter();
  const today = localDateInZone(new Date(), "Europe/Vienna");
  const inCompletedColumn = Boolean(
    columns.find((column) => column.id === task.columnId)?.isCompleted,
  );
  const overdue =
    !inCompletedColumn && task.dueDate !== null && task.dueDate < today;
  const subtasks = subtasksByParent[task.id] ?? [];
  const leaves = descendantLeaves(task.id, subtasksByParent);
  const completedSubtasks = leaves.filter(
    (subtask) =>
      columns.find((column) => column.id === subtask.columnId)?.isCompleted,
  ).length;

  return (
    <div
      onClick={onClick}
      data-task-id={task.id}
      data-task-title={task.title}
      className={`flex cursor-pointer flex-col gap-2 rounded-md border bg-card p-3 text-sm shadow-xs ${
        overlay ? "rotate-2 shadow-lg" : "hover:border-ring/40"
      }`}
    >
      {onClick ? (
        <button
          type="button"
          className="w-fit max-w-full text-left font-medium hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onClick();
          }}
        >
          {task.title}
        </button>
      ) : (
        <span className="font-medium">{task.title}</span>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={`${PRIORITY_STYLES[task.priority]} border-transparent`}>
          {t(
            task.priority === "high"
              ? "priorityHigh"
              : task.priority === "low"
                ? "priorityLow"
                : "priorityMedium",
          )}
        </Badge>
        {task.dueDate && (
          <span
            className={`flex items-center gap-1 text-xs ${
              overdue ? "font-medium text-destructive" : "text-muted-foreground"
            }`}
          >
            <CalendarDays className="size-3" />
            {format.dateTime(localDateValue(task.dueDate)!, {
              day: "2-digit",
              month: "2-digit",
            })}
          </span>
        )}
        {task.assignees.length > 0 && (
          <div className="ml-auto flex flex-wrap gap-1">
            {task.assignees.map((person) => (
              <UserIdentity key={person.id} userId={person.id} name={person.name} avatarOnly className="[&>span:first-child]:size-5" />
            ))}
          </div>
        )}
      </div>
      {subtasks.length > 0 && (
        <div className="mt-1 rounded-md border border-violet-200/80 bg-violet-50/45 dark:border-violet-900 dark:bg-violet-950/20">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
            onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onToggleExpanded?.();
            }}
            aria-expanded={expanded}
            aria-label={t("toggleSubtasks")}
          >
            {expanded ? (
              <ChevronDown className="size-3.5 text-violet-600" />
            ) : (
              <ChevronRight className="size-3.5 text-violet-600" />
            )}
            <span className="text-xs font-medium">
              {t("subtaskProgress", {
                completed: completedSubtasks,
                total: leaves.length,
              })}
            </span>
            <span className="ml-auto font-mono text-[11px] text-muted-foreground">
              {task.progress}%
            </span>
          </button>
          <div className="mx-2.5 h-1 overflow-hidden rounded-full bg-violet-100 dark:bg-violet-950">
            <div
              className="h-full rounded-full bg-violet-500 transition-[width]"
              style={{ width: `${task.progress}%` }}
            />
          </div>
          {expanded && (
            <div className="mt-2">
              <RecursiveTaskRows
                parentId={task.id}
                depth={0}
                subtasksByParent={subtasksByParent}
                columns={columns}
                expandedTasks={expandedTasks}
                onToggleTask={onToggleTask ?? (() => undefined)}
                onAddSubtask={onAddSubtask}
                onEditTask={(child) => onEditSubtask?.(child)}
              />
            </div>
          )}
        </div>
      )}
      {!overlay && onAddSubtask && !task.isMilestone && (
        <button
          type="button"
          data-add-subtask-for={task.id}
          className="mt-0.5 flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onAddSubtask(task);
          }}
        >
          <Plus className="size-3" />
          {t("newSubtask")}
        </button>
      )}
    </div>
  );
}
