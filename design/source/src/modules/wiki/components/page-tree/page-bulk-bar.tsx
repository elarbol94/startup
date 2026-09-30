"use client";

import { useTranslations } from "next-intl";
import { ChevronDown, FolderInput, Tags, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SelectionBar } from "@/components/selection-bar";
import type { RowSelection } from "@/lib/use-row-selection";
import { pageStatuses } from "./page-tree-types";
import type { PageActions } from "./use-page-actions";

/** Bulk actions for the selected pages. */
export function PageBulkBar({ selection, actions, canMove = true }: { selection: RowSelection; actions: PageActions; canMove?: boolean }) {
  const t = useTranslations("wiki");
  const tCommon = useTranslations("common");
  const ids = selection.selectedIds;
  return (
    <SelectionBar count={selection.count} onClear={selection.clear}>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" disabled={actions.pending} />}>
          {tCommon("status")}<ChevronDown className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          {pageStatuses.map((status) => <DropdownMenuItem key={status} onClick={() => void actions.setStatus(ids, status)}>{t(`pageStatuses.${status}`)}</DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="ghost" size="sm" disabled={actions.pending} onClick={() => actions.editTags(ids)}><Tags className="size-4" />{tCommon("tags.label")}</Button>
      {canMove && <Button variant="ghost" size="sm" disabled={actions.pending} onClick={() => actions.move(ids)}><FolderInput className="size-4" />{t("pageMenu.move")}</Button>}
      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={actions.pending} onClick={() => void actions.trash(ids)}><Trash2 className="size-4" />{tCommon("moveToTrash")}</Button>
    </SelectionBar>
  );
}
