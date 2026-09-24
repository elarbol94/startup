// Confirmation dialog for deleting a task (and its subtree, or lifting its children out).
// Used by portfolio-client.tsx.
"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { useTaskTreeActions } from "./use-task-tree-actions";

export function DeleteTaskDialog({
  pendingDelete,
  setPendingDelete,
  deletePending,
  outdentChildrenThenDelete,
  confirmDeleteTask,
}: Pick<
  ReturnType<typeof useTaskTreeActions>,
  | "pendingDelete"
  | "setPendingDelete"
  | "deletePending"
  | "outdentChildrenThenDelete"
  | "confirmDeleteTask"
>) {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  return (
    <Dialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && !deletePending && setPendingDelete(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{t("deleteTaskTitle")}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          {pendingDelete && pendingDelete.descendantCount > 0
            ? t("deleteTaskWithSubtasks", {
                title: pendingDelete.task.title,
                count: pendingDelete.descendantCount,
              })
            : t("deleteTaskConfirm", { title: pendingDelete?.task.title ?? "" })}
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={deletePending} onClick={() => setPendingDelete(null)}>{tCommon("cancel")}</Button>
          {pendingDelete && pendingDelete.descendantCount > 0 && (
            <Button variant="outline" disabled={deletePending} onClick={() => void outdentChildrenThenDelete()}>{t("outdentChildrenInstead")}</Button>
          )}
          <Button variant="destructive" disabled={deletePending} onClick={() => void confirmDeleteTask()}>{tCommon("delete")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
