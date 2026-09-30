"use client";

import { useTranslations } from "next-intl";
import { CircleDot, FolderInput, MoreHorizontal, Pencil, Tags, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { WorkspacePage } from "../../research-queries";
import { pageStatuses, type PageStatus } from "./page-tree-types";
import type { PageActions } from "./use-page-actions";

/** Per-row "⋯" menu: rename, status, tags, move and trash for one page. */
export function PageRowMenu({ page, actions, canMove = true, className }: { page: WorkspacePage; actions: PageActions; canMove?: boolean; className?: string }) {
  const t = useTranslations("wiki");
  const tCommon = useTranslations("common");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-xs" className={cn("shrink-0 text-muted-foreground", className)} aria-label={tCommon("more", { name: page.title })} data-testid="page-row-menu" />}
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => void actions.rename(page)}><Pencil />{tCommon("rename")}</DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger><CircleDot />{tCommon("status")}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={page.status} onValueChange={(value) => void actions.setStatus([page.id], value as PageStatus)}>
              {pageStatuses.map((status) => <DropdownMenuRadioItem key={status} value={status}>{t(`pageStatuses.${status}`)}</DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onClick={() => actions.editTags([page.id])}><Tags />{t("pageMenu.editTags")}</DropdownMenuItem>
        {canMove && <DropdownMenuItem onClick={() => actions.move([page.id])}><FolderInput />{t("pageMenu.move")}</DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => void actions.trash([page.id])}><Trash2 />{tCommon("moveToTrash")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
