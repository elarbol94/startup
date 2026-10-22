// Dependency-link state and actions of the task dialog: the add-link draft, adding a
// link and removing one. Used by task-dialog.tsx; rendered by task-dependencies-section.tsx.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { deleteTaskDependency } from "@/modules/projects/dependency-actions";
import {
  addTaskDependencyFromDialog,
  deleteProjectTaskDependency,
} from "@/modules/projects/task-dialog-actions";
import type { DependencyType } from "@/modules/projects/schedule";
import type { BoardTaskDto } from "./task-dialog-types";
import { failureMessage } from "./task-dialog-utils";

export function useTaskLinks({
  task,
  readOnly,
  onChanged,
}: {
  task: BoardTaskDto | null;
  readOnly: boolean;
  /** Called after a link was added or removed so the dialog details reload. */
  onChanged: () => void;
}) {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [linkDirection, setLinkDirection] = useState<"predecessor" | "successor">("predecessor");
  const [linkTaskId, setLinkTaskId] = useState("none");
  const [linkType, setLinkType] = useState<DependencyType>("finish_to_start");
  const [linkLagDays, setLinkLagDays] = useState(0);
  const [linkPending, setLinkPending] = useState(false);

  function resetLinks() {
    setLinkDirection("predecessor");
    setLinkTaskId("none");
    setLinkType("finish_to_start");
    setLinkLagDays(0);
  }

  async function addLink() {
    if (!task || linkTaskId === "none" || readOnly) return;
    setLinkPending(true);
    try {
      const result = await addTaskDependencyFromDialog({
        predecessorTaskId: linkDirection === "predecessor" ? linkTaskId : task.id,
        successorTaskId: linkDirection === "predecessor" ? task.id : linkTaskId,
        dependencyType: linkType,
        lagDays: linkLagDays,
      });
      if (!result.ok) {
        toast.error(failureMessage(t, tCommon, result.code));
        return;
      }
      setLinkTaskId("none");
      setLinkType("finish_to_start");
      setLinkLagDays(0);
      onChanged();
      toast.success(t("dependencySaved"));
      router.refresh();
    } catch {
      toast.error(t("dependencySaveError"));
    } finally {
      setLinkPending(false);
    }
  }

  async function removeLink(link: { id: string; name: string; legacyProject?: boolean }) {
    if (readOnly) return;
    if (!window.confirm(t("removeDependencyConfirm", { name: link.name }))) return;
    setLinkPending(true);
    try {
      if (link.legacyProject) await deleteProjectTaskDependency(link.id);
      else await deleteTaskDependency(link.id);
      onChanged();
      toast.success(t("dependencyDeleted"));
      router.refresh();
    } catch {
      toast.error(t("dependencySaveError"));
    } finally {
      setLinkPending(false);
    }
  }

  return {
    linkDirection, setLinkDirection, linkTaskId, setLinkTaskId, linkType, setLinkType,
    linkLagDays, setLinkLagDays, linkPending, resetLinks, addLink, removeLink,
  };
}
