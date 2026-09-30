"use client";
import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Inbox } from "lucide-react";
import { useRowSelection } from "@/lib/use-row-selection";
import type { WorkspacePage } from "../research-queries";
import { parseTagList } from "../lib/tags";
import { pageStatuses } from "./page-tree/page-tree-types";
import { PageBulkBar } from "./page-tree/page-bulk-bar";
import { usePageActions } from "./page-tree/use-page-actions";
import { noWorkspaceFilters, WorkspaceFilterBar, type WorkspaceFilters } from "./workspace-pages/workspace-filter-bar";
import { WorkspaceNoteRow } from "./workspace-pages/workspace-note-row";
import { WorkspaceStatusGroup } from "./workspace-pages/workspace-status-group";
import { useWorkspacePages } from "./workspace-pages/use-workspace-pages";

const tagNamesFor = (page: WorkspacePage) => parseTagList(page.tags).map((tag) => tag.name);

export function WorkspacePageList({ pages: initialPages }: { pages: WorkspacePage[] }) {
  const t = useTranslations("wiki");
  const locale = useLocale();
  const { pages, pendingId, patchStatus, changeStatus, changeFavorite } = useWorkspacePages(initialPages);
  const [filters, setFilters] = useState<WorkspaceFilters>(noWorkspaceFilters);
  const [evergreenOpen, setEvergreenOpen] = useState(false);
  const tags = useMemo(() => Array.from(new Set(pages.flatMap(tagNamesFor))).sort((a, b) => a.localeCompare(b, locale)), [locale, pages]);
  const visible = useMemo(() => {
    const clean = filters.query.trim().toLocaleLowerCase(locale);
    return pages.filter((page) =>
      (!clean || [page.title, page.contentText, tagNamesFor(page).join(" "), page.updatedByName].some((value) => value.toLocaleLowerCase(locale).includes(clean))) &&
      (filters.status === "all" || page.status === filters.status) &&
      (filters.tag === "all" || tagNamesFor(page).includes(filters.tag)) &&
      (!filters.favoritesOnly || page.favorite),
    );
  }, [filters, locale, pages]);
  const groups = useMemo(() => pageStatuses
    .filter((status) => filters.status === "all" || status === filters.status)
    .map((status) => ({
      status,
      pages: visible.filter((page) => page.status === status),
      open: status !== "evergreen" || evergreenOpen || filters.status === "evergreen",
    })), [evergreenOpen, filters.status, visible]);
  // Only notes in expanded groups are on screen, so only they can stay selected.
  const visibleIds = useMemo(() => groups.filter((group) => group.open).flatMap((group) => group.pages.map((page) => page.id)), [groups]);
  const selection = useRowSelection(visibleIds);
  const actions = usePageActions(pages, { deselect: selection.deselect, patchStatus });

  if (pages.length === 0)
    return (
      <div className="grid min-h-72 place-items-center rounded-xl border border-dashed bg-muted/20 text-center">
        <div>
          <Inbox className="mx-auto mb-3 size-8 text-indigo-400" />
          <h2 className="font-medium">{t("inboxEmpty")}</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t("inboxEmptyDescription")}</p>
        </div>
      </div>
    );
  return (
    <div className="space-y-5">
      <WorkspaceFilterBar filters={filters} onChange={setFilters} tags={tags} />
      {groups.map((group) => (
        <WorkspaceStatusGroup
          key={group.status}
          status={group.status}
          ids={group.pages.map((page) => page.id)}
          open={group.open}
          collapsible={group.status === "evergreen"}
          onToggleOpen={() => setEvergreenOpen((value) => !value)}
          selection={selection}
        >
          {group.pages.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">{t("emptyStatusGroup")}</p>
          ) : group.pages.map((page) => (
            <WorkspaceNoteRow
              key={page.id}
              page={page}
              pending={pendingId === page.id}
              selection={selection}
              actions={actions}
              onStatus={(status) => void changeStatus(page, status)}
              onFavorite={() => void changeFavorite(page)}
            />
          ))}
        </WorkspaceStatusGroup>
      ))}
      <PageBulkBar selection={selection} actions={actions} canMove={false} />
      {actions.dialogs}
    </div>
  );
}
