"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useTextPrompt } from "@/components/ui/text-prompt-dialog";
import { TagEditDialog, type TagEditOption } from "@/components/tag-edit-dialog";
import { useBulkAction } from "@/lib/use-bulk-action";
import type { WorkspacePage } from "../../research-queries";
import { renamePage } from "../../actions";
import { deletePages, movePages, setPagesStatus, updatePagesTags } from "../../page-bulk-actions";
import { descendantIds } from "../../lib/page-tree";
import { parseTagList } from "../../lib/tags";
import { MovePagesDialog } from "./move-pages-dialog";
import type { PageStatus } from "./page-tree-types";

export type PageActions = ReturnType<typeof usePageActions>;

/**
 * Metadata and trash actions for one or many pages, shared by the row menu and the
 * selection bar. Render `dialogs` once next to the list.
 */
export function usePageActions(pages: WorkspacePage[], options: {
  deselect: (ids: readonly string[]) => void;
  /** Applies a status locally before the server answers; returns an undo. */
  patchStatus?: (ids: readonly string[], status: PageStatus) => () => void;
}) {
  const t = useTranslations("wiki");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { run, pending } = useBulkAction(options.deselect);
  const [confirmDialog, confirm] = useConfirm();
  const [promptDialog, prompt] = useTextPrompt();
  const [tagIds, setTagIds] = useState<string[] | null>(null);
  const [moveIds, setMoveIds] = useState<string[] | null>(null);

  const tagOptions = useMemo((): TagEditOption[] => {
    if (!tagIds) return [];
    const selected = new Set(tagIds);
    const byId = new Map<string, TagEditOption>();
    for (const page of pages) for (const tag of parseTagList(page.tags)) {
      const option = byId.get(tag.id) ?? { key: tag.id, name: tag.name, count: 0 };
      if (selected.has(page.id)) option.count += 1;
      byId.set(tag.id, option);
    }
    return [...byId.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [pages, tagIds]);

  async function rename(page: WorkspacePage) {
    const title = await prompt({ title: t("pageMenu.renameTitle"), label: t("pageMenu.renameLabel"), defaultValue: page.title, required: true, maxLength: 200, confirmLabel: tCommon("rename") });
    if (!title || title === page.title) return;
    try {
      await renamePage(page.id, title);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tCommon("error"));
    }
  }

  async function setStatus(ids: string[], status: PageStatus) {
    const undo = options.patchStatus?.(ids, status);
    const outcome = await run(() => setPagesStatus({ ids, status }));
    if (!outcome) undo?.();
  }

  async function trash(ids: string[]) {
    const below = descendantIds(pages, ids).size - ids.length;
    const title = ids.length === 1 ? pages.find((page) => page.id === ids[0])?.title : undefined;
    const ok = await confirm({
      title: tCommon("confirmTrashTitle"),
      description: [
        title ? t("bulk.trashConfirmOne", { title }) : t("bulk.trashConfirm", { count: ids.length }),
        below > 0 ? t("bulk.trashDescendants", { count: below }) : "",
      ].filter(Boolean).join(" "),
      confirmLabel: tCommon("moveToTrash"),
      destructive: true,
    });
    if (!ok) return;
    await run(() => deletePages({ ids }), { done: (outcome) => t("bulk.trashed", { count: outcome.affectedIds.length }) });
  }

  const dialogs: ReactNode = <>
    {confirmDialog}
    {promptDialog}
    <TagEditDialog
      open={tagIds !== null}
      onOpenChange={(open) => { if (!open) setTagIds(null); }}
      options={tagOptions}
      selectedCount={tagIds?.length ?? 0}
      onSubmit={async (change) => { if (tagIds) await run(() => updatePagesTags({ ids: tagIds, ...change })); }}
    />
    <MovePagesDialog
      open={moveIds !== null}
      onOpenChange={(open) => { if (!open) setMoveIds(null); }}
      pages={pages}
      ids={moveIds ?? []}
      onMove={async (parentId) => { if (moveIds) await run(() => movePages({ ids: moveIds, parentId }), { done: (outcome) => t("bulk.moved", { count: outcome.succeededIds.length }) }); }}
    />
  </>;

  return {
    dialogs,
    pending,
    rename,
    setStatus,
    trash,
    editTags: (ids: string[]) => setTagIds(ids),
    move: (ids: string[]) => setMoveIds(ids),
  };
}
