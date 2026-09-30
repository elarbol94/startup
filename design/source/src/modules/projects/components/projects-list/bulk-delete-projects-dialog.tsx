"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePendingDelete } from "@/lib/use-pending-delete";
import type { ProjectImpact } from "../../project-links";
import { deleteProjects, getProjectsImpact } from "../../project-bulk-actions";

/**
 * Confirms deleting several projects with their combined impact, then deletes them
 * after the usual Undo window.
 */
export function BulkDeleteProjectsDialog({ ids, onOpenChange, onScheduled }: { ids: string[] | null; onOpenChange: (open: boolean) => void; onScheduled: (ids: string[]) => void }) {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const scheduleDelete = usePendingDelete();
  const [impact, setImpact] = useState<{ key: string; value: ProjectImpact | null } | null>(null);
  const key = ids?.join(",") ?? "";

  useEffect(() => {
    if (!ids?.length) return;
    let cancelled = false;
    const current = ids.join(",");
    getProjectsImpact({ ids })
      .then((value) => { if (!cancelled) setImpact({ key: current, value }); })
      // Still allow the delete; only the counts are missing.
      .catch(() => { if (!cancelled) setImpact({ key: current, value: null }); });
    return () => { cancelled = true; };
  }, [ids]);

  const loaded = impact?.key === key;
  const counts = loaded ? impact.value : null;

  function confirm() {
    if (!ids?.length) return;
    const selected = [...ids];
    scheduleDelete({
      hiddenIds: selected,
      commit: async () => {
        const outcome = await deleteProjects({ ids: selected });
        if (outcome.skipped.length) return tCommon("selection.partial", { done: outcome.succeededIds.length, skipped: outcome.skipped.length });
      },
      onCommitted: () => router.refresh(),
    });
    onScheduled(selected);
    onOpenChange(false);
  }

  return (
    <Dialog open={Boolean(ids?.length)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" role="alertdialog">
        <DialogHeader>
          <DialogTitle>{t("bulk.deleteTitle", { count: ids?.length ?? 0 })}</DialogTitle>
          <DialogDescription>{t("bulk.deleteConfirm")}</DialogDescription>
        </DialogHeader>
        {counts && <p className="text-sm">{t("deleteProjectImpact", { tasks: counts.tasks, columns: counts.columns, dependencies: counts.dependencies })}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tCommon("cancel")}</Button>
          <Button variant="destructive" disabled={!loaded} onClick={confirm}>{tCommon("delete")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
