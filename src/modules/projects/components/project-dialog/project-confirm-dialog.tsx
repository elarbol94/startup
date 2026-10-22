// Confirmation for archiving or deleting a project, with what it affects.
// Used by project-dialog.tsx (ProjectDialogs).
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePendingDelete } from "@/lib/use-pending-delete";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteProject, setProjectStatus } from "@/modules/projects/actions";
import { getProjectImpact } from "@/modules/projects/project-actions";
import type { ProjectImpact } from "@/modules/projects/project-links";
import type { ProjectRecord } from "./project-dialog-types";

/** Confirmation for archiving or deleting a project, with what it affects. */
export function ProjectConfirmDialog({
  action,
  project,
  onOpenChange,
  onDone,
  afterDoneHref,
}: {
  action: "archive" | "delete";
  project: Pick<ProjectRecord, "id" | "name"> | null;
  onOpenChange: (open: boolean) => void;
  onDone?: (projectId: string) => void;
  /** Navigate here afterwards instead of refreshing the current route. */
  afterDoneHref?: string;
}) {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [impact, setImpact] = useState<{ projectId: string; value: ProjectImpact | null } | null>(null);
  const [pending, setPending] = useState(false);
  const scheduleDelete = usePendingDelete();
  // Keep the last project visible while the dialog animates closed.
  const [shown, setShown] = useState(project);
  if (project && project !== shown) setShown(project);

  const projectId = project?.id;
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    getProjectImpact(projectId)
      .then((value) => {
        if (!cancelled) setImpact({ projectId, value });
      })
      .catch(() => {
        // Still allow the action; only the counts are missing.
        if (!cancelled) setImpact({ projectId, value: null });
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const loaded = Boolean(impact && impact.projectId === projectId);
  const current = loaded ? impact!.value : null;

  async function confirm() {
    if (!project) return;
    if (action === "delete") {
      // Delayed delete: hidden now, committed after the Undo window. The
      // project and its tasks are filtered out wherever they are listed.
      const projectId = project.id;
      scheduleDelete({
        hiddenIds: [projectId],
        commit: async () => {
          await deleteProject(projectId);
        },
        onCommitted: () => {
          onDone?.(projectId);
          router.refresh();
        },
      });
      onOpenChange(false);
      if (afterDoneHref) router.push(afterDoneHref);
      return;
    }
    setPending(true);
    try {
      await setProjectStatus(project.id, "archived");
      onDone?.(project.id);
      onOpenChange(false);
      if (afterDoneHref) router.push(afterDoneHref);
      else router.refresh();
    } catch {
      toast.error(tCommon("error"));
    } finally {
      setPending(false);
    }
  }

  const name = shown?.name ?? "";
  return (
    <Dialog open={Boolean(project)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{action === "delete" ? t("deleteProjectTitle") : t("archiveProjectTitle")}</DialogTitle>
          <DialogDescription>
            {action === "delete" ? t("deleteProjectConfirm", { name }) : t("archiveProjectConfirm", { name })}
          </DialogDescription>
        </DialogHeader>
        {action === "delete" && current && (
          <p className="text-sm">
            {t("deleteProjectImpact", {
              tasks: current.tasks,
              columns: current.columns,
              dependencies: current.dependencies,
            })}
          </p>
        )}
        {action === "archive" && current && current.openTasks > 0 && (
          <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t("archiveProjectOpenTasks", { count: current.openTasks })}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button
            variant={action === "delete" ? "destructive" : "default"}
            disabled={pending || (action === "delete" && !loaded)}
            onClick={confirm}
          >
            {action === "delete" ? tCommon("delete") : t("archive")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
