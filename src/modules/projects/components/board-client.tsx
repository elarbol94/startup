"use client";

// Kanban board for one project: optimistic drag-and-drop between columns, column
// management and the task dialog. Pieces live in ./board/.
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
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
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { toast } from "sonner";
import {
  ArrowLeft,
  Archive,
  Loader2,
  Plus,
} from "lucide-react";
import { setProjectStatus } from "@/modules/projects/actions";
import { moveTask, deleteColumn, upsertColumn } from "@/modules/projects/board-actions";
import { moveColumn } from "@/modules/projects/column-actions";
import type { projects as projectsTable } from "@/modules/projects/schema";
import { Button } from "@/components/ui/button";
import { TaskDialog, type BoardTaskDto, type MemberDto } from "./task-dialog";
import { cn } from "@/lib/utils";
import type { ColumnDto } from "./board/board-types";
import { TaskCard } from "./board/task-card";
import { BoardColumn } from "./board/board-column";
import { ColumnNameDialog } from "./board/column-name-dialog";

type Project = typeof projectsTable.$inferSelect;

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
