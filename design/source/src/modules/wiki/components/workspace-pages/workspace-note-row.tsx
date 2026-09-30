"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Clock3, Star, UserRound } from "lucide-react";
import { UserIdentity } from "@/components/user-identity";
import { RowSelectCheckbox } from "@/components/row-selection";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { RowSelection } from "@/lib/use-row-selection";
import type { WorkspacePage } from "../../research-queries";
import { parseTagList } from "../../lib/tags";
import { pageStatuses, type PageStatus } from "../page-tree/page-tree-types";
import { PageRowMenu } from "../page-tree/page-row-menu";
import type { PageActions } from "../page-tree/use-page-actions";

export function WorkspaceNoteRow({ page, pending, selection, actions, onStatus, onFavorite }: {
  page: WorkspacePage;
  pending: boolean;
  selection: RowSelection;
  actions: PageActions;
  onStatus: (status: PageStatus) => void;
  onFavorite: () => void;
}) {
  const t = useTranslations("wiki");
  const format = useFormatter();
  const tags = parseTagList(page.tags);
  const selected = selection.isSelected(page.id);
  return (
    <article
      data-testid="workspace-note"
      data-selected={selected || undefined}
      className="group grid grid-cols-[auto_minmax(0,1fr)] gap-3 p-4 transition-colors hover:bg-indigo-50/60 data-selected:bg-accent/60 md:grid-cols-[auto_minmax(0,1fr)_auto] dark:hover:bg-indigo-950/20"
    >
      <span className={cn("pt-1 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100", (selection.count > 0) && "sm:opacity-100")}>
        <RowSelectCheckbox id={page.id} label={page.title} selection={selection} />
      </span>
      <div className="min-w-0">
        <Link href={`/wiki/pages/${page.slug}`} className="block">
          <h3 className="truncate font-medium group-hover:text-indigo-700 dark:group-hover:text-indigo-300">{page.title}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{page.contentText || t("emptyNote")}</p>
        </Link>
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {tags.map((tag) => (
              <Link key={tag.id} href={`/wiki/tags/${tag.id}`} className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-200 dark:hover:bg-indigo-900">{tag.name}</Link>
            ))}
          </div>
        )}
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Clock3 className="size-3" />{format.dateTime(new Date(page.updatedAt), { dateStyle: "medium" })}</span>
          <span className="flex items-center gap-1"><UserRound className="size-3" /><UserIdentity userId={page.updatedBy} name={page.updatedByName} compact /></span>
        </p>
      </div>
      <div className="col-start-2 flex items-start gap-1 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 md:col-start-auto">
        <Button data-testid="workspace-note-favorite" variant="ghost" size="icon-sm" disabled={pending} onClick={onFavorite} title={t("favorite")} aria-label={`${t("favorite")}: ${page.title}`} aria-pressed={page.favorite}>
          <Star className={cn("size-4", page.favorite && "fill-indigo-400 text-indigo-500")} />
        </Button>
        <Select value={page.status} onValueChange={(value) => onStatus(value as PageStatus)} disabled={pending}>
          <SelectTrigger data-testid="workspace-note-status" aria-label={`${t("allPageStatuses")}: ${page.title}`} className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {pageStatuses.map((item) => <SelectItem key={item} value={item}>{t(`pageStatuses.${item}`)}</SelectItem>)}
          </SelectContent>
        </Select>
        <PageRowMenu page={page} actions={actions} canMove={false} className="size-8" />
      </div>
    </article>
  );
}
