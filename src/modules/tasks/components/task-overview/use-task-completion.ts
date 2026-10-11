"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { moveDashboardTask } from "@/modules/projects/contextual-task-actions";
import type { OverviewTask } from "../task-overview";

/**
 * Checking a task off is optimistic: the row strikes through at once and stays where it was
 * (also when the list only shows open tasks) until the page is left; failures roll back.
 */
export function useTaskCompletion() {
  const t = useTranslations("tasks");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [overrides, setOverrides] = useState<ReadonlyMap<string, OverviewTask["boardStage"]>>(new Map());
  const [justCompleted, setJustCompleted] = useState<ReadonlySet<string>>(new Set());

  const stageOf = (task: OverviewTask) => overrides.get(task.id) ?? task.boardStage;
  const isDone = (task: OverviewTask) => stageOf(task) === "done";

  function toggle(task: OverviewTask) {
    const previous = stageOf(task);
    const next = previous === "done" ? "todo" : "done";
    setOverrides((current) => new Map(current).set(task.id, next));
    setJustCompleted((current) => {
      const updated = new Set(current);
      if (next === "done") updated.add(task.id);
      else updated.delete(task.id);
      return updated;
    });
    startTransition(async () => {
      try {
        await moveDashboardTask({ taskId: task.id, stage: next });
        router.refresh();
      } catch {
        setOverrides((current) => new Map(current).set(task.id, previous));
        setJustCompleted((current) => {
          const updated = new Set(current);
          updated.delete(task.id);
          return updated;
        });
        toast.error(t("board.moveFailed"));
      }
    });
  }

  return { pending, isDone, justCompleted, toggle };
}
