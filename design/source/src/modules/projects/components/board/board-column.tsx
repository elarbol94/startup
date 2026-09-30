"use client";

// One Kanban board column: header with column menu, droppable area and sortable
// (draggable) task cards. Used by board-client.tsx.
import { useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDroppable } from "@dnd-kit/core";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BoardTaskDto } from "../task-dialog";
import type { ColumnDto } from "./board-types";
import { TaskCard } from "./task-card";

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

export function BoardColumn({
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
