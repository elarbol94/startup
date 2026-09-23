"use client";

import { UserIdentity } from "@/components/user-identity";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDroppable } from "@dnd-kit/core";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  Archive,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  moveTask,
  deleteColumn,
  setProjectStatus,
  upsertColumn,
} from "@/modules/projects/actions";
import { moveColumn } from "@/modules/projects/column-actions";
import type { projects as projectsTable } from "@/modules/projects/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TaskDialog, type BoardTaskDto, type MemberDto } from "./task-dialog";
import { cn } from "@/lib/utils";
import { localDateValue } from "@/modules/tasks/deadline-utils";
import { localDateInZone } from "@/modules/calendar/date-utils";

type Project = typeof projectsTable.$inferSelect;
type ColumnDto = {
  id: string;
  name: string;
  sortOrder: number;
  isCompleted: boolean;
  workflowStage: "todo" | "in_progress";
};

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

function descendantLeaves(
  taskId: string,
  subtasksByParent: Record<string, BoardTaskDto[]>,
): BoardTaskDto[] {
  const children = subtasksByParent[taskId] ?? [];
  if (children.length === 0) return [];
  return children.flatMap((child) => {
    const descendants = descendantLeaves(child.id, subtasksByParent);
    return descendants.length > 0 ? descendants : [child];
  });
}

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

function TaskCard({
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

function SortableTask({
  task,
  subtasksByParent,
  columns,
  onClick,
  onAddSubtask,
  onEditSubtask,
  expandedTasks,
  onToggleTask,
  readOnly,
}: {
  task: BoardTaskDto;
  subtasksByParent: Record<string, BoardTaskDto[]>;
  columns: ColumnDto[];
  onClick: () => void;
  onAddSubtask: (task: BoardTaskDto) => void;
  onEditSubtask: (task: BoardTaskDto) => void;
  expandedTasks: Set<string>;
  onToggleTask: (taskId: string) => void;
  readOnly: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: "task", columnId: task.columnId },
    disabled: readOnly,
  });
  // The card wrapper is also the keyboard activator, so Space/Enter on the
  // nested buttons (subtasks, add subtask) keep their own behaviour.
  const setRefs = useCallback(
    (node: HTMLElement | null) => {
      setNodeRef(node);
      setActivatorNodeRef(node);
    },
    [setNodeRef, setActivatorNodeRef],
  );

  return (
    <div
      ref={setRefs}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "opacity-40" : undefined}
      {...attributes}
      {...listeners}
    >
      <TaskCard
        task={task}
        subtasksByParent={subtasksByParent}
        columns={columns}
        onClick={onClick}
        onAddSubtask={readOnly ? undefined : onAddSubtask}
        onEditSubtask={onEditSubtask}
        expanded={expandedTasks.has(task.id)}
        onToggleExpanded={() => onToggleTask(task.id)}
        expandedTasks={expandedTasks}
        onToggleTask={onToggleTask}
      />
    </div>
  );
}

function BoardColumn({
  column,
  tasks,
  subtasksByParent,
  columns,
  onAddTask,
  onAddSubtask,
  onEditTask,
  onEditSubtask,
  expandedTasks,
  onToggleTask,
  onRename,
  onDelete,
  onToggleCompleted,
  onWorkflowStage,
  onMove,
  canDelete,
  canMoveLeft,
  canMoveRight,
  readOnly,
}: {
  column: ColumnDto;
  tasks: BoardTaskDto[];
  subtasksByParent: Record<string, BoardTaskDto[]>;
  columns: ColumnDto[];
  onAddTask: () => void;
  onAddSubtask: (task: BoardTaskDto) => void;
  onEditTask: (task: BoardTaskDto) => void;
  onEditSubtask: (task: BoardTaskDto) => void;
  expandedTasks: Set<string>;
  onToggleTask: (taskId: string) => void;
  onRename: () => void;
  onDelete: () => void;
  onToggleCompleted: () => void;
  onWorkflowStage: (stage: "todo" | "in_progress") => void;
  onMove: (direction: "left" | "right") => void;
  canDelete: boolean;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  readOnly: boolean;
}) {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  const { setNodeRef } = useDroppable({
    id: column.id,
    data: { type: "column" },
    disabled: readOnly,
  });
  const boardT = useTranslations("tasks.board");

  return (
    <div
      className="flex min-w-[15rem] flex-1 basis-0 flex-col gap-2 rounded-lg bg-muted/50 p-2"
      data-column-name={column.name}
    >
      <div className="flex items-center gap-2 px-1">
        <span className="text-sm font-medium">{column.name}</span>
        <span className="text-xs text-muted-foreground">{tasks.length}</span>
        <div className="ml-auto flex items-center">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onAddTask}
            disabled={readOnly}
            title={t("newTask")}
            aria-label={t("newTask")}
          >
            <Plus className="size-3.5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={readOnly}
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={tCommon("actions")}
                />
              }
            >
              <MoreHorizontal className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onRename}>
                <Pencil className="mr-2 size-4" />
                {t("renameColumn")}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!canMoveLeft} onClick={() => onMove("left")}>
                <ArrowLeft className="mr-2 size-4" />
                {t("moveColumnLeft")}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!canMoveRight} onClick={() => onMove("right")}>
                <ArrowRight className="mr-2 size-4" />
                {t("moveColumnRight")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onToggleCompleted}>
                <CheckCircle2 className="mr-2 size-4" />
                {column.isCompleted
                  ? t("markColumnIncomplete")
                  : t("markColumnCompleted")}
              </DropdownMenuItem>
              {!column.isCompleted && <>
                <DropdownMenuItem disabled={column.workflowStage === "todo"} onClick={() => onWorkflowStage("todo")}>{boardT("mapTodo")}</DropdownMenuItem>
                <DropdownMenuItem disabled={column.workflowStage === "in_progress"} onClick={() => onWorkflowStage("in_progress")}>{boardT("mapProgress")}</DropdownMenuItem>
              </>}
              {canDelete && (
                <DropdownMenuItem variant="destructive" onClick={onDelete}>
                  <Trash2 className="mr-2 size-4" />
                  {t("deleteColumn")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <SortableContext
        items={tasks.map((task) => task.id)}
        strategy={verticalListSortingStrategy}
      >
        <div ref={setNodeRef} className="flex min-h-24 flex-col gap-2">
          {tasks.map((task) => (
            <SortableTask
              key={task.id}
              task={task}
              subtasksByParent={subtasksByParent}
              columns={columns}
              onClick={() => onEditTask(task)}
              onAddSubtask={onAddSubtask}
              onEditSubtask={onEditSubtask}
              expandedTasks={expandedTasks}
              onToggleTask={onToggleTask}
              readOnly={readOnly}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

/** Small create/rename dialog; Enter submits the form, Escape closes it. */
function ColumnNameDialog({
  open,
  initialName,
  renaming,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  initialName: string;
  renaming: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string) => Promise<void>;
}) {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  const [name, setName] = useState(initialName);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || pending) return;
    setPending(true);
    try {
      await onSave(name.trim());
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{renaming ? t("renameColumn") : t("newColumn")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="board-column-name">{t("columnName")}</Label>
            <Input
              id="board-column-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              autoFocus
              required
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {tCommon("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BoardClient({
  project,
  columns,
  tasksByColumn,
  subtasksByParent,
  members,
  predecessorOptions = [],
  hideHeader = false,
}: {
  project: Project;
  columns: ColumnDto[];
  tasksByColumn: Record<string, BoardTaskDto[]>;
  subtasksByParent: Record<string, BoardTaskDto[]>;
  members: MemberDto[];
  predecessorOptions?: Array<{ id: string; title: string; dueDate: string | null; type: "project" | "task" }>;
  hideHeader?: boolean;
}) {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const readOnly = project.status === "archived";

  // Local optimistic copy of the board, refreshed from the server props
  // via render-time state adjustment.
  const [board, setBoard] = useState(tasksByColumn);
  const [prevTasksByColumn, setPrevTasksByColumn] = useState(tasksByColumn);
  if (prevTasksByColumn !== tasksByColumn) {
    setPrevTasksByColumn(tasksByColumn);
    setBoard(tasksByColumn);
  }

  const [activeTask, setActiveTask] = useState<BoardTaskDto | null>(null);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<BoardTaskDto | null>(null);
  const [newTaskColumnId, setNewTaskColumnId] = useState<string | null>(null);
  const [newTaskParentId, setNewTaskParentId] = useState<string | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(
    () => new Set(),
  );
  const [columnDialog, setColumnDialog] = useState<{
    key: number;
    open: boolean;
    column: ColumnDto | null;
  }>({ key: 0, open: false, column: null });
  const [restoring, setRestoring] = useState(false);
  const dragStartBoardRef = useRef<Record<string, BoardTaskDto[]> | null>(null);
  // True while the open task dialog owns a history entry pushed by openTask.
  const pushedTaskEntryRef = useRef(false);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const taskIndex = useMemo(() => {
    const map = new Map<string, BoardTaskDto>();
    for (const list of Object.values(board)) {
      for (const task of list) map.set(task.id, task);
    }
    for (const list of Object.values(subtasksByParent)) {
      for (const task of list) map.set(task.id, task);
    }
    return map;
  }, [board, subtasksByParent]);

  const focusedTaskId = searchParams.get("task");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!focusedTaskId) {
        setTaskDialogOpen(false);
        return;
      }
      const task = taskIndex.get(focusedTaskId);
      if (!task) {
        setTaskDialogOpen(false);
        return;
      }
      setEditingTask(task);
      setNewTaskColumnId(task.columnId);
      setNewTaskParentId(task.parentTaskId);
      setTaskDialogOpen(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [focusedTaskId, taskIndex]);

  // Browser Back/Forward leaves the pushed entry; useSearchParams then drops
  // `task` and the effect above closes the dialog.
  useEffect(() => {
    const onPopState = () => {
      pushedTaskEntryRef.current = false;
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function findColumnOf(taskId: string): string | undefined {
    for (const [columnId, list] of Object.entries(board)) {
      if (list.some((task) => task.id === taskId)) return columnId;
    }
    return undefined;
  }

  function onDragStart(event: DragStartEvent) {
    dragStartBoardRef.current = board;
    setActiveTask(taskIndex.get(String(event.active.id)) ?? null);
  }

  function restoreCancelledDrag() {
    if (dragStartBoardRef.current) {
      setBoard(dragStartBoardRef.current);
    }
    dragStartBoardRef.current = null;
    setActiveTask(null);
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const fromColumn = findColumnOf(activeId);
    const toColumn =
      over.data.current?.type === "column" ? overId : findColumnOf(overId);
    if (!fromColumn || !toColumn || fromColumn === toColumn) return;

    // Move the task into the target column while dragging (visual preview).
    setBoard((current) => {
      const task = current[fromColumn].find((item) => item.id === activeId);
      if (!task) return current;
      const overIndex =
        over.data.current?.type === "column"
          ? current[toColumn].length
          : current[toColumn].findIndex((item) => item.id === overId);
      const next = { ...current };
      next[fromColumn] = current[fromColumn].filter((item) => item.id !== activeId);
      const target = [...current[toColumn]];
      target.splice(overIndex < 0 ? target.length : overIndex, 0, {
        ...task,
        columnId: toColumn,
      });
      next[toColumn] = target;
      return next;
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const startBoard = dragStartBoardRef.current;
    if (!over) {
      restoreCancelledDrag();
      return;
    }
    const activeId = String(active.id);
    const overId = String(over.id);
    const toColumn =
      over.data.current?.type === "column" ? overId : findColumnOf(overId);
    const column = toColumn ? [...(board[toColumn] ?? [])] : [];
    const fromIndex = column.findIndex((item) => item.id === activeId);
    if (!toColumn || fromIndex === -1) {
      restoreCancelledDrag();
      return;
    }

    // Compute the final position once, outside any state updater, so the
    // move is persisted exactly once.
    let toIndex =
      over.data.current?.type === "column"
        ? column.length - 1
        : column.findIndex((item) => item.id === overId);
    if (toIndex < 0) toIndex = column.length - 1;
    const [moved] = column.splice(fromIndex, 1);
    column.splice(toIndex, 0, moved);
    const afterTaskId = toIndex > 0 ? column[toIndex - 1].id : null;

    dragStartBoardRef.current = null;
    setActiveTask(null);
    setBoard({ ...board, [toColumn]: column });

    const startColumn = startBoard?.[toColumn] ?? [];
    const startIndex = startColumn.findIndex((item) => item.id === activeId);
    if (
      startIndex !== -1 &&
      (startIndex > 0 ? startColumn[startIndex - 1].id : null) === afterTaskId
    ) {
      return; // Dropped where it started.
    }
    moveTask({ taskId: activeId, columnId: toColumn, afterTaskId }).catch(() => {
      toast.error(tCommon("error"));
      router.refresh();
    });
  }

  function openColumnDialog(column: ColumnDto | null) {
    setColumnDialog((current) => ({ key: current.key + 1, open: true, column }));
  }

  function closeColumnDialog() {
    setColumnDialog((current) => ({ ...current, open: false }));
  }

  async function saveColumnName(name: string) {
    const column = columnDialog.column;
    if (column && column.name === name) {
      closeColumnDialog();
      return;
    }
    try {
      await upsertColumn(
        column
          ? { id: column.id, projectId: project.id, name }
          : { projectId: project.id, name },
      );
      closeColumnDialog();
      router.refresh();
    } catch {
      toast.error(tCommon("error"));
    }
  }

  async function onDeleteColumn(column: ColumnDto) {
    if (!window.confirm(tCommon("confirmDeleteTitle"))) return;
    try {
      await deleteColumn(column.id);
      router.refresh();
    } catch {
      toast.error(tCommon("error"));
    }
  }

  async function onMoveColumn(column: ColumnDto, direction: "left" | "right") {
    try {
      const { moved } = await moveColumn({ columnId: column.id, direction });
      if (moved) router.refresh();
    } catch {
      toast.error(tCommon("error"));
    }
  }

  async function onRestoreProject() {
    setRestoring(true);
    try {
      await setProjectStatus(project.id, "active");
      router.refresh();
    } catch {
      toast.error(tCommon("error"));
    } finally {
      setRestoring(false);
    }
  }

  function openNewTask(columnId: string, parentTaskId: string | null = null) {
    if (readOnly) return;
    setEditingTask(null);
    setNewTaskColumnId(columnId);
    setNewTaskParentId(parentTaskId);
    setTaskDialogOpen(true);
  }

  function openTask(task: BoardTaskDto) {
    setEditingTask(task);
    setNewTaskColumnId(task.columnId);
    setNewTaskParentId(task.parentTaskId);
    setTaskDialogOpen(true);
    const params = new URLSearchParams(window.location.search);
    if (params.get("task") === task.id) return;
    params.set("task", task.id);
    window.history.pushState(null, "", `${window.location.pathname}?${params.toString()}`);
    pushedTaskEntryRef.current = true;
  }

  function setDialogOpen(nextOpen: boolean) {
    setTaskDialogOpen(nextOpen);
    if (nextOpen) return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has("task")) return;
    if (pushedTaskEntryRef.current) {
      // Undo our own push so Back afterwards leaves the board as expected.
      pushedTaskEntryRef.current = false;
      window.history.back();
      return;
    }
    // Opened directly via ?task=: nothing of ours to pop, just clean the URL.
    params.delete("task");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`,
    );
  }

  function toggleTask(taskId: string) {
    setExpandedTasks((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  async function onToggleCompleted(column: ColumnDto) {
    try {
      await upsertColumn({
        id: column.id,
        projectId: project.id,
        name: column.name,
        isCompleted: !column.isCompleted,
      });
      router.refresh();
    } catch {
      toast.error(tCommon("error"));
    }
  }

  return (
    <div className="flex h-full min-w-0 w-full flex-col gap-4">
      {readOnly && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
        >
          <Archive className="size-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{t("archivedTitle")}</p>
            <p className="text-xs opacity-80">{t("archivedDescription")}</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={onRestoreProject}
            disabled={restoring}
          >
            {restoring && <Loader2 className="size-4 animate-spin" />}
            {t("unarchive")}
          </Button>
        </div>
      )}
      <div className={cn("flex min-w-0 w-full items-center gap-2", hideHeader && "justify-end")}>
        {!hideHeader && (
          <>
        <Button
          variant="ghost"
          size="icon-sm"
          nativeButton={false}
          render={<Link href="/projects" />}
          aria-label={t("title")}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <span
          className="inline-block size-3 rounded-full"
          style={{ backgroundColor: project.color }}
        />
        <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight">{project.name}</h1>
          </>
        )}
        <Button
          size="sm"
          className={hideHeader ? "" : "ml-auto"}
          onClick={() => {
            openNewTask(columns[0]?.id ?? "");
          }}
          disabled={readOnly || columns.length === 0}
        >
          <Plus className="size-4" />
          {t("newTask")}
        </Button>
      </div>

      <DndContext
        id={`board-${project.id}`}
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={restoreCancelledDrag}
      >
        <div className="flex min-w-0 max-w-full flex-1 items-start gap-3 overflow-x-auto pb-4">
          {columns.map((column, index) => (
            <BoardColumn
              key={column.id}
              column={column}
              tasks={board[column.id] ?? []}
              subtasksByParent={subtasksByParent}
              columns={columns}
              expandedTasks={expandedTasks}
              canDelete={columns.length > 1}
              canMoveLeft={index > 0}
              canMoveRight={index < columns.length - 1}
              readOnly={readOnly}
              onAddTask={() => openNewTask(column.id)}
              onAddSubtask={(task) => {
                setExpandedTasks((current) => {
                  const next = new Set(current);
                  let cursor: BoardTaskDto | undefined = task;
                  while (cursor) {
                    next.add(cursor.id);
                    cursor = cursor.parentTaskId
                      ? taskIndex.get(cursor.parentTaskId)
                      : undefined;
                  }
                  return next;
                });
                openNewTask(task.columnId, task.id);
              }}
              onEditTask={openTask}
              onEditSubtask={openTask}
              onToggleTask={toggleTask}
              onRename={() => openColumnDialog(column)}
              onDelete={() => onDeleteColumn(column)}
              onToggleCompleted={() => onToggleCompleted(column)}
              onMove={(direction) => onMoveColumn(column, direction)}
              onWorkflowStage={async workflowStage => {
                try { await upsertColumn({ id: column.id, projectId: project.id, name: column.name, workflowStage }); router.refresh(); }
                catch { toast.error(tCommon("error")); }
              }}
            />
          ))}
          {!readOnly && (
            <Button
              variant="outline"
              size="sm"
              className="mt-1 shrink-0"
              onClick={() => openColumnDialog(null)}
            >
              <Plus className="size-4" />
              {t("newColumn")}
            </Button>
          )}
        </div>
        <DragOverlay>
          {activeTask && <TaskCard task={activeTask} columns={columns} overlay />}
        </DragOverlay>
      </DndContext>

      <ColumnNameDialog
        key={columnDialog.key}
        open={columnDialog.open}
        initialName={columnDialog.column?.name ?? ""}
        renaming={columnDialog.column !== null}
        onOpenChange={(open) => {
          if (!open) closeColumnDialog();
        }}
        onSave={saveColumnName}
      />

      <TaskDialog
        open={taskDialogOpen}
        onOpenChange={setDialogOpen}
        projectId={project.id}
        columns={columns}
        members={members}
        task={editingTask}
        defaultColumnId={newTaskColumnId}
        defaultParentTaskId={newTaskParentId}
        parentTask={
          (editingTask?.parentTaskId
            ? taskIndex.get(editingTask.parentTaskId)
            : newTaskParentId
              ? taskIndex.get(newTaskParentId)
              : null) ?? null
        }
        subtasks={editingTask ? (subtasksByParent[editingTask.id] ?? []) : []}
        predecessorOptions={predecessorOptions.filter((candidate) => candidate.id !== editingTask?.id)}
        readOnly={readOnly}
      />
    </div>
  );
}
