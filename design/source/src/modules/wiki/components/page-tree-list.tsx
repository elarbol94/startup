"use client";
import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FileText } from "lucide-react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { SelectAllCheckbox } from "@/components/row-selection";
import { useRowSelection } from "@/lib/use-row-selection";
import type { WorkspacePage } from "../research-queries";
import { parseTagList } from "../lib/tags";
import { buildPageTree } from "../lib/page-tree";
import { useWikiLocalSetting, useWikiNavigation } from "./wiki-navigation";
import { PageBulkBar } from "./page-tree/page-bulk-bar";
import { PageRow } from "./page-tree/page-row";
import { PageTreeToolbar } from "./page-tree/page-tree-toolbar";
import { parseIdList, visibleRows } from "./page-tree/page-tree-utils";
import { usePageActions } from "./page-tree/use-page-actions";
import { usePageTreeOrder } from "./page-tree/use-page-tree-order";

export function PageTreeList({ pages }: { pages: WorkspacePage[] }) {
  const t = useTranslations("wiki");
  const locale = useLocale();
  const { userId } = useWikiNavigation();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [tag, setTag] = useState("all");
  const [collapsedRaw, saveCollapsed] = useWikiLocalSetting(`wiki-pages-collapsed:${userId}`);
  const collapsed = useMemo(() => new Set(parseIdList(collapsedRaw)), [collapsedRaw]);
  const { order, patchStatus, handleDragEnd } = usePageTreeOrder(pages);
  const rows = useMemo(() => buildPageTree(order), [order]);
  const childCounts = useMemo(() => {
    const known = new Set(order.map((page) => page.id));
    const counts = new Map<string, number>();
    for (const page of order) if (page.parentId && known.has(page.parentId)) counts.set(page.parentId, (counts.get(page.parentId) ?? 0) + 1);
    return counts;
  }, [order]);
  const tagOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const page of order) for (const item of parseTagList(page.tags)) byId.set(item.id, item.name);
    return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [locale, order]);
  const searching = query.trim().length > 0 || status !== "all" || tag !== "all";
  const visible = useMemo(() => visibleRows(rows, { query, status, tag, collapsed, locale }), [collapsed, locale, query, rows, status, tag]);
  const visibleIds = useMemo(() => visible.map((row) => row.id), [visible]);
  const selection = useRowSelection(visibleIds);
  const actions = usePageActions(order, { deselect: selection.deselect, patchStatus });
  const parentIds = [...childCounts.keys()];
  const allCollapsed = parentIds.length > 0 && parentIds.every((id) => collapsed.has(id));
  function toggle(id: string) {
    // Only current parents are kept, so ids of deleted pages do not pile up in storage.
    const current = [...collapsed].filter((item) => childCounts.has(item));
    saveCollapsed(collapsed.has(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (pages.length === 0)
    return <div className="grid min-h-72 place-items-center rounded-xl border border-dashed bg-muted/20 text-center">
      <div>
        <FileText className="mx-auto mb-3 size-8 text-muted-foreground/60" />
        <h2 className="font-medium">{t("noDocuments")}</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t("noDocumentsDescription")}</p>
      </div>
    </div>;

  // Dragging is off while filtering (the visible order is no longer the sibling
  // order a drop would write) and while rows are selected (a drop has no clear
  // meaning for a selection; "Move…" covers that).
  const sortable = !searching && selection.count === 0;
  return <div className="space-y-3">
    <PageTreeToolbar
      query={query} onQuery={setQuery}
      status={status} onStatus={setStatus}
      tag={tag} onTag={setTag}
      tagOptions={tagOptions}
      searching={searching}
      onClear={() => { setQuery(""); setStatus("all"); setTag("all"); }}
      canCollapse={parentIds.length > 0}
      allCollapsed={allCollapsed}
      onToggleAll={() => saveCollapsed(allCollapsed ? [] : parentIds)}
    />
    {searching && <p role="status" className="px-1 text-xs text-muted-foreground">{t("workspace.documentCount", { shown: visible.length, total: pages.length })}</p>}
    {visible.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("noSearchResults")}</p> :
    <DndContext id="wiki-document-tree" sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void handleDragEnd(event)}>
      <SortableContext items={visibleIds} strategy={verticalListSortingStrategy}>
        <div className="divide-y overflow-hidden rounded-xl border">
          <div className="flex h-9 items-center gap-2 bg-muted/30 pr-3 pl-3 text-xs text-muted-foreground">
            <SelectAllCheckbox selection={selection} />
            <span>{selection.count > 0 ? t("bulk.selectedOf", { count: selection.count, total: visible.length }) : t("bulk.selectHint")}</span>
          </div>
          {visible.map((row) => (
            <PageRow
              key={row.id}
              row={row}
              sortable={sortable}
              searching={searching}
              childCount={childCounts.get(row.id) ?? 0}
              collapsed={collapsed.has(row.id)}
              onToggle={() => toggle(row.id)}
              selection={selection}
              actions={actions}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>}
    <PageBulkBar selection={selection} actions={actions} />
    {actions.dialogs}
  </div>;
}
