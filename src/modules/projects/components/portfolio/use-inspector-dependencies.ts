// Incoming-dependency state and actions of the schedule inspector: the add form, the
// edit-dialog draft, and removing a link with undo. Used by schedule-inspector.tsx.
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { deleteTaskDependency, upsertTaskDependency } from "@/modules/projects/dependency-actions";
import type {
  PortfolioSchedule,
  PortfolioTask,
} from "@/modules/projects/queries";
import {
  dependencyTypeOf,
  taskAncestors,
  taskDescendants,
  type DependencyType,
} from "@/modules/projects/schedule";
import { dependencyDraftIsInvalid } from "./dependency-utils";
import type { DependencyDraft, PortfolioDependency } from "./portfolio-types";
import { scheduleErrorMessage } from "./schedule-error-message";

export function useInspectorDependencies({
  task,
  schedule,
  onScheduleChanged,
}: {
  task: PortfolioTask | null;
  schedule: PortfolioSchedule;
  onScheduleChanged?: () => Promise<void>;
}) {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [predecessorId, setPredecessorId] = useState("none");
  const [dependencyType, setDependencyType] =
    useState<DependencyType>("finish_to_start");
  const [lagDays, setLagDays] = useState(0);
  const [dependencyEditorDraft, setDependencyEditorDraft] =
    useState<DependencyDraft | null>(null);
  const [dependencyPending, setDependencyPending] = useState(false);
  const [deletingDependencyId, setDeletingDependencyId] = useState<string | null>(null);

  const incoming = task
    ? schedule.dependencies.filter((dependency) => dependency.successorTaskId === task.id)
    : [];
  // Summaries can anchor links now (R6); only the task's own branch is excluded,
  // because a summary already spans its subtree.
  const linkableTasks = useMemo(() => {
    if (!task) return [];
    const excluded = new Set([
      task.id,
      ...taskAncestors(schedule.tasks, task.id).map((ancestor) => ancestor.id),
      ...taskDescendants(schedule.tasks, task.id).map((descendant) => descendant.id),
    ]);
    return schedule.tasks.filter((candidate) => !excluded.has(candidate.id));
  }, [schedule.tasks, task]);

  async function addDependency() {
    if (!task || predecessorId === "none" || dependencyPending) return;
    setDependencyPending(true);
    try {
      const result = await upsertTaskDependency({
        predecessorTaskId: predecessorId,
        successorTaskId: task.id,
        dependencyType,
        lagDays,
        routeOffsetDays: null,
        routeOffsetRows: null,
      });
      if (!result.ok) {
        toast.error(scheduleErrorMessage(t, result.code, "dependency"));
        return;
      }
      setPredecessorId("none");
      setDependencyType("finish_to_start");
      setLagDays(0);
      if (onScheduleChanged) await onScheduleChanged();
      else router.refresh();
    } catch {
      toast.error(tCommon("error"));
    } finally {
      setDependencyPending(false);
    }
  }

  /**
   * Removes a link straight away and offers undo, like a schedule edit. Undo
   * saves the same link again.
   */
  async function removeIncomingDependency(dependency: PortfolioDependency) {
    if (deletingDependencyId) return;
    setDeletingDependencyId(dependency.id);
    try {
      const result = await deleteTaskDependency(dependency.id);
      if (!result.ok) {
        toast.error(scheduleErrorMessage(t, result.code, "dependency"));
        return;
      }
      if (onScheduleChanged) await onScheduleChanged();
      else router.refresh();
      const removed = result.dependency;
      toast(t("dependencyDeleted"), {
        duration: 5000,
        action: {
          label: t("undo"),
          onClick: () => {
            void (async () => {
              try {
                const restored = await upsertTaskDependency({
                  predecessorTaskId: removed.predecessorTaskId,
                  successorTaskId: removed.successorTaskId,
                  dependencyType: dependencyTypeOf(removed),
                  lagDays: removed.lagDays,
                  routeOffsetDays: removed.routeOffsetDays,
                  routeOffsetRows: removed.routeOffsetRows,
                });
                if (!restored.ok) {
                  toast.error(scheduleErrorMessage(t, restored.code, "dependency"));
                  return;
                }
                if (onScheduleChanged) await onScheduleChanged();
                else router.refresh();
                toast.success(t("dependencyRestored"));
              } catch {
                toast.error(tCommon("error"));
              }
            })();
          },
        },
      });
    } catch {
      toast.error(t("dependencySaveError"));
    } finally {
      setDeletingDependencyId(null);
    }
  }

  async function saveDependencyDraft() {
    if (!dependencyEditorDraft) return;
    if (
      dependencyDraftIsInvalid(
        schedule.tasks,
        schedule.dependencies,
        dependencyEditorDraft,
      )
    ) {
      toast.error(t("dependencyInvalid"));
      return;
    }
    setDependencyPending(true);
    try {
      const result = await upsertTaskDependency({
        id: dependencyEditorDraft.isNew
          ? undefined
          : dependencyEditorDraft.id,
        predecessorTaskId: dependencyEditorDraft.predecessorTaskId,
        successorTaskId: dependencyEditorDraft.successorTaskId,
        dependencyType: dependencyEditorDraft.dependencyType,
        lagDays: dependencyEditorDraft.lagDays,
        routeOffsetDays: dependencyEditorDraft.routeOffsetDays,
        routeOffsetRows: dependencyEditorDraft.routeOffsetRows,
      });
      if (!result.ok) {
        toast.error(scheduleErrorMessage(t, result.code, "dependency"));
        return;
      }
      setDependencyEditorDraft(null);
      if (onScheduleChanged) await onScheduleChanged();
      else router.refresh();
      toast.success(t("dependencySaved"));
    } catch {
      toast.error(t("dependencySaveError"));
    } finally {
      setDependencyPending(false);
    }
  }

  async function deleteDependencyDraft() {
    if (!dependencyEditorDraft || dependencyEditorDraft.isNew) return;
    setDependencyPending(true);
    try {
      const result = await deleteTaskDependency(dependencyEditorDraft.id);
      if (!result.ok) {
        toast.error(scheduleErrorMessage(t, result.code, "dependency"));
        return;
      }
      setDependencyEditorDraft(null);
      if (onScheduleChanged) await onScheduleChanged();
      else router.refresh();
      toast.success(t("dependencyDeleted"));
    } catch {
      toast.error(t("dependencySaveError"));
    } finally {
      setDependencyPending(false);
    }
  }

  return {
    predecessorId, setPredecessorId, dependencyType, setDependencyType, lagDays, setLagDays,
    dependencyEditorDraft, setDependencyEditorDraft, dependencyPending, deletingDependencyId,
    incoming, linkableTasks, addDependency, removeIncomingDependency, saveDependencyDraft,
    deleteDependencyDraft,
  };
}
