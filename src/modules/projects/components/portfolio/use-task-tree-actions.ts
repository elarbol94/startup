// Work-breakdown actions: expand/collapse, opening/creating tasks, revealing projects,
// deleting (with subtree handling) and indent/outdent. Used by portfolio-client.tsx.
"use client";

import { useState, type RefObject } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { deleteTask, reparentTask } from "@/modules/projects/task-actions";
import { deleteTaskKeepChildren } from "@/modules/projects/delete-actions";
import type {
  PortfolioSchedule,
  PortfolioTask,
} from "@/modules/projects/queries";
import {
  indentTarget,
  outdentTarget,
  taskAncestors,
  taskDescendants,
} from "@/modules/projects/schedule";
import type { EmbeddedProjectPlanner, SetState } from "./portfolio-types";
import { scheduleErrorMessage } from "./schedule-error-message";

export function useTaskTreeActions({
  schedule,
  embedded,
  isDraftTask,
  refreshSchedule,
  reducedMotion,
  scrollRef,
  selectedTaskId,
  structurePending,
  setStructurePending,
  setExpandedProjects,
  setExpandedTasks,
  setSelectedTaskId,
  setInspectorOpen,
  setOwner,
  setHealth,
  setQuery,
}: {
  schedule: PortfolioSchedule;
  embedded?: EmbeddedProjectPlanner;
  isDraftTask: (id: string) => boolean;
  refreshSchedule: () => Promise<void>;
  reducedMotion: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  selectedTaskId: string | null;
  structurePending: boolean;
  setStructurePending: SetState<boolean>;
  setExpandedProjects: SetState<Set<string>>;
  setExpandedTasks: SetState<Set<string>>;
  setSelectedTaskId: SetState<string | null>;
  setInspectorOpen: SetState<boolean>;
  setOwner: SetState<string>;
  setHealth: SetState<"all" | "risk" | "track">;
  setQuery: SetState<string>;
}) {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  const [newTaskContext, setNewTaskContext] = useState<{
    projectId: string;
    parentTaskId: string | null;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    task: PortfolioTask;
    descendantCount: number;
  } | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  function toggle(setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) {
    setter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openTask(task: PortfolioTask) {
    if (isDraftTask(task.id)) return;
    setSelectedTaskId(task.id);
    setNewTaskContext(null);
    setInspectorOpen(true);
  }

  function revealProject(projectId: string) {
    setExpandedProjects((current) => new Set(current).add(projectId));
    setOwner("all");
    setHealth("all");
    setQuery("");
    requestAnimationFrame(() => {
      scrollRef.current
        ?.querySelector<HTMLElement>(`[data-project-id="${projectId}"]`)
        ?.scrollIntoView({
          behavior: reducedMotion ? "auto" : "smooth",
          block: "center",
          inline: "nearest",
        });
    });
  }

  function newTask(
    projectId: string,
    parentTaskId: string | null = null,
  ) {
    if (embedded) return;
    if (parentTaskId) {
      const ancestors = taskAncestors(schedule.tasks, parentTaskId);
      setExpandedTasks((current) => {
        const next = new Set(current);
        next.add(parentTaskId);
        ancestors.forEach((ancestor) => next.add(ancestor.id));
        return next;
      });
    }
    setSelectedTaskId(null);
    setNewTaskContext({ projectId, parentTaskId });
    setInspectorOpen(true);
  }

  /**
   * Deleting a summary takes its whole subtree with it, so the count is spelled
   * out first and lifting the children out is offered as an alternative (R10).
   */
  function requestDeleteTask(task: PortfolioTask) {
    setPendingDelete({
      task,
      descendantCount: taskDescendants(schedule.tasks, task.id).length,
    });
  }

  function closeDeletedTask(task: PortfolioTask, subtreeDeleted: boolean) {
    const removed = new Set([
      task.id,
      ...(subtreeDeleted ? taskDescendants(schedule.tasks, task.id).map((child) => child.id) : []),
    ]);
    if (selectedTaskId && removed.has(selectedTaskId)) {
      setSelectedTaskId(null);
      setInspectorOpen(false);
    }
  }

  async function confirmDeleteTask() {
    if (!pendingDelete || deletePending) return;
    const { task } = pendingDelete;
    setDeletePending(true);
    try {
      await deleteTask(task.id);
      setPendingDelete(null);
      closeDeletedTask(task, true);
      await refreshSchedule();
      toast.success(tCommon("deleted"));
    } catch {
      toast.error(tCommon("error"));
    } finally {
      setDeletePending(false);
    }
  }

  /** Lifts the children to the deleted task's parent in one transaction. */
  async function outdentChildrenThenDelete() {
    if (!pendingDelete || deletePending) return;
    const { task } = pendingDelete;
    setDeletePending(true);
    try {
      const result = await deleteTaskKeepChildren(task.id);
      if (!result.ok) {
        toast.error(scheduleErrorMessage(t, result.code, "delete"));
        return;
      }
      setPendingDelete(null);
      closeDeletedTask(task, false);
      if (task.parentTaskId) {
        setExpandedTasks((current) => new Set([...current, task.parentTaskId!]));
      }
      await refreshSchedule();
      toast.success(tCommon("deleted"));
    } catch {
      toast.error(tCommon("error"));
    } finally {
      setDeletePending(false);
    }
  }

  /**
   * Moves a task in the hierarchy and refreshes in place. A soft refresh keeps
   * client state, including unsaved inspector edits, the scroll position and
   * which rows are expanded.
   */
  async function reparentRow(task: PortfolioTask, parentTaskId: string | null) {
    if (structurePending) return;
    setStructurePending(true);
    try {
      const result = await reparentTask({ taskId: task.id, parentTaskId });
      if (!result.ok) {
        toast.error(scheduleErrorMessage(t, result.code, "structure"));
        return;
      }
      // Keep the moved row selected so it stays in context after the refresh.
      setSelectedTaskId(task.id);
      setExpandedProjects((current) => new Set([...current, task.projectId]));
      if (parentTaskId) {
        setExpandedTasks((current) => new Set([...current, parentTaskId]));
      }
      await refreshSchedule();
    } catch {
      toast.error(tCommon("error"));
    } finally {
      setStructurePending(false);
    }
  }

  /**
   * Nests a task under the sibling above it (R5). The new parent turns into a
   * summary, so its own dates give way to the rollup of its children.
   */
  async function indentRow(task: PortfolioTask) {
    if (embedded) return;
    const siblings = schedule.tasks.filter((candidate) => candidate.projectId === task.projectId);
    const target = indentTarget(siblings, task.id);
    if (!target) {
      toast.error(t("indentUnavailable"));
      return;
    }
    await reparentRow(task, target.id);
  }

  /** Lifts a task out to its grandparent (R5). */
  async function outdentRow(task: PortfolioTask) {
    if (embedded) return;
    const siblings = schedule.tasks.filter((candidate) => candidate.projectId === task.projectId);
    const target = outdentTarget(siblings, task.id);
    if (target === undefined) {
      toast.error(t("outdentUnavailable"));
      return;
    }
    await reparentRow(task, target);
  }

  return {
    newTaskContext, toggle, openTask, revealProject, newTask, pendingDelete, setPendingDelete,
    deletePending, requestDeleteTask, confirmDeleteTask, outdentChildrenThenDelete, indentRow, outdentRow,
  };
}
