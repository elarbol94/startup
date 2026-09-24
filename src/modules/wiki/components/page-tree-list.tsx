"use client";
import { UserIdentity } from "@/components/user-identity";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, Clock3, FileText, GripVertical, Search, X } from "lucide-react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import type { WorkspacePage } from "../research-queries";
import { parseTagList } from "../lib/tags";
import { buildPageTree } from "../lib/page-tree";
import { reorderPages } from "../actions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useWikiLocalSetting, useWikiNavigation } from "./wiki-navigation";

type Row = WorkspacePage & { depth: number };
const statuses = ["inbox", "working", "evergreen"] as const;
const INDENT = 20;

function parseIdList(raw: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function PageRow({ row, sortable, children }: { row: Row; sortable: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
    disabled: !sortable,
  });
  const t = useTranslations("wiki");
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        paddingLeft: `${28 + row.depth * INDENT}px`,
        opacity: isDragging ? 0.6 : 1,
      }}
      data-depth={row.depth}
      className="group relative flex min-h-11 flex-wrap items-center gap-x-2 gap-y-0.5 bg-card py-1.5 pr-3 transition-colors hover:bg-muted/40"
    >
      {/* Indent guides: one hairline per ancestor level so siblings visibly line up. */}
      {Array.from({ length: row.depth }, (_, level) => (
        <span key={level} aria-hidden className="pointer-events-none absolute inset-y-0 w-px bg-border" style={{ left: `${36 + level * INDENT}px` }} />
      ))}
      {sortable && (
        <button
          type="button"
          className="absolute top-1/2 left-1 shrink-0 -translate-y-1/2 cursor-grab touch-none rounded p-0.5 text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
          aria-label={t("reorderPage", { title: row.title })}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      )}
      {children}
    </div>
  );
}

export function PageTreeList({ pages }: { pages: WorkspacePage[] }) {
  const t = useTranslations("wiki");
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const { userId } = useWikiNavigation();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [tag, setTag] = useState("all");
  const [collapsedRaw, saveCollapsed] = useWikiLocalSetting(`wiki-pages-collapsed:${userId}`);
  const collapsed = useMemo(() => new Set(parseIdList(collapsedRaw)), [collapsedRaw]);
  const [order, setOrder] = useState<WorkspacePage[]>(pages);
  // Optimistic order is local state, so a refreshed server list has to replace it;
  // without this the list keeps showing the pre-refresh order.
  const [syncedPages, setSyncedPages] = useState(pages);
  if (pages !== syncedPages) {
    setSyncedPages(pages);
    setOrder(pages);
  }
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
  const filtering = status !== "all" || tag !== "all";
  const searching = query.trim().length > 0 || filtering;
  const visible = useMemo(() => {
    const clean = query.trim().toLocaleLowerCase(locale);
    if (!clean && status === "all" && tag === "all") {
      // Hide descendants of collapsed pages; rows are depth-first, so skip until depth returns.
      const shown: Row[] = [];
      let hiddenBelow: number | null = null;
      for (const row of rows) {
        if (hiddenBelow !== null && row.depth > hiddenBelow) continue;
        hiddenBelow = collapsed.has(row.id) ? row.depth : null;
        shown.push(row);
      }
      return shown;
    }
    // Filtering flattens the tree: a matching child without its parent must still be reachable.
    return rows
      .filter((row) => status === "all" || row.status === status)
      .filter((row) => tag === "all" || parseTagList(row.tags).some((item) => item.id === tag))
      .filter((row) => !clean ||
        [row.title, row.contentText, row.updatedByName, parseTagList(row.tags).map((item) => item.name).join(" ")]
          .some((value) => value.toLocaleLowerCase(locale).includes(clean)),
      )
      .map((row) => ({ ...row, depth: 0 }));
  }, [collapsed, locale, query, rows, status, tag]);
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

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const moved = order.find((page) => page.id === active.id);
    const target = order.find((page) => page.id === over.id);
    if (!moved || !target) return;
    // Reordering only rearranges siblings; dropping onto another branch would reparent,
    // which this list does not support yet.
    if ((moved.parentId ?? null) !== (target.parentId ?? null)) {
      toast.error(t("reorderSameLevelOnly"));
      return;
    }
    const siblings = order
      .filter((page) => (page.parentId ?? null) === (moved.parentId ?? null))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
    const from = siblings.findIndex((page) => page.id === moved.id);
    const to = siblings.findIndex((page) => page.id === target.id);
    if (from < 0 || to < 0) return;
    const orderedIds = arrayMove(siblings, from, to).map((page) => page.id);

    const previous = order;
    const position = new Map(orderedIds.map((id, index) => [id, index]));
    setOrder((pagesInState) =>
      pagesInState.map((page) => (position.has(page.id) ? { ...page, sortOrder: position.get(page.id)! } : page)),
    );
    try {
      await reorderPages({ parentId: moved.parentId ?? null, orderedIds });
      router.refresh();
    } catch (error) {
      setOrder(previous);
      toast.error(error instanceof Error ? error.message : t("reorderFailed"));
    }
  }

  if (pages.length === 0)
    return <div className="grid min-h-72 place-items-center rounded-xl border border-dashed bg-muted/20 text-center">
      <div>
        <FileText className="mx-auto mb-3 size-8 text-muted-foreground/60" />
        <h2 className="font-medium">{t("noDocuments")}</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t("noDocumentsDescription")}</p>
      </div>
    </div>;

  const rowBody = (row: Row) => {
    const tags = parseTagList(row.tags);
    const children = searching ? 0 : childCounts.get(row.id) ?? 0;
    const isCollapsed = collapsed.has(row.id);
    return <>
      {children > 0 ? (
        <button
          type="button"
          onClick={() => toggle(row.id)}
          aria-expanded={!isCollapsed}
          aria-label={t(isCollapsed ? "workspace.expandPage" : "workspace.collapsePage", { title: row.title })}
          className="-ml-1 grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight className={cn("size-4 transition-transform motion-reduce:transition-none", !isCollapsed && "rotate-90")} />
        </button>
      ) : <span aria-hidden className="-ml-1 size-6 shrink-0" />}
      <Link href={`/wiki/pages/${row.slug}`} className="flex min-w-0 flex-1 basis-[calc(100%-3rem)] items-center gap-2 py-1 sm:basis-auto">
        <FileText className="size-4 shrink-0 text-muted-foreground/60" />
        <span className={cn("truncate text-sm", row.depth === 0 && !searching ? "font-semibold" : "font-medium")}>{row.title}</span>
        {children > 0 && isCollapsed && <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground tabular-nums">{t("workspace.childCount", { count: children })}</span>}
      </Link>
      <span className="flex basis-full flex-wrap items-center gap-x-2 gap-y-0.5 pl-8 sm:basis-auto sm:pl-0">
        {tags.slice(0, 2).map((item) => <Link key={item.id} href={`/wiki/tags/${item.id}`} className="rounded bg-muted/60 px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground">{item.name}</Link>)}
        {tags.length > 2 && <Popover><PopoverTrigger render={<Button size="xs" variant="ghost" aria-label={t("workspace.moreTags", { count: tags.length - 2 })} />}>+{tags.length - 2}</PopoverTrigger><PopoverContent className="flex w-60 flex-wrap gap-2">{tags.slice(2).map((item) => <Link key={item.id} href={`/wiki/tags/${item.id}`} className="rounded-md bg-muted px-2 py-1 text-xs">{item.name}</Link>)}</PopoverContent></Popover>}
        <span className="w-20 text-[11px] text-muted-foreground">{t(`pageStatuses.${row.status}`)}</span>
        <span className="hidden w-36 items-center gap-1 text-[11px] text-muted-foreground lg:flex"><UserIdentity userId={row.updatedBy} name={row.updatedByName} compact /></span>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums"><Clock3 className="size-3" />{format.dateTime(new Date(row.updatedAt), { dateStyle: "medium" })}</span>
      </span>
    </>;
  };

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-56 flex-1">
        <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
        <Input aria-label={t("searchDocuments")} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("searchDocuments")} className="pl-9" />
      </div>
      <Select value={status} onValueChange={(value) => setStatus(value ?? "all")}>
        <SelectTrigger aria-label={t("workspace.filterStatus")} className="w-40"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="all">{t("workspace.allStatuses")}</SelectItem>{statuses.map((item) => <SelectItem key={item} value={item}>{t(`pageStatuses.${item}`)}</SelectItem>)}</SelectContent>
      </Select>
      {tagOptions.length > 0 && <Select value={tag} onValueChange={(value) => setTag(value ?? "all")}>
        <SelectTrigger aria-label={t("workspace.filterTag")} className="w-44"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="all">{t("allTags")}</SelectItem>{tagOptions.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
      </Select>}
      {searching ? (
        <Button variant="ghost" size="sm" onClick={() => { setQuery(""); setStatus("all"); setTag("all"); }}><X className="size-4" />{t("workspace.clearFilters")}</Button>
      ) : parentIds.length > 0 && (
        <Button variant="ghost" size="sm" onClick={() => saveCollapsed(allCollapsed ? [] : parentIds)}>
          {allCollapsed ? <ChevronsUpDown className="size-4" /> : <ChevronsDownUp className="size-4" />}{t(allCollapsed ? "workspace.expandAll" : "workspace.collapseAll")}
        </Button>
      )}
    </div>
    {searching && <p role="status" className="px-1 text-xs text-muted-foreground">{t("workspace.documentCount", { shown: visible.length, total: pages.length })}</p>}
    {visible.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("noSearchResults")}</p> :
    <DndContext id="wiki-document-tree" sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void handleDragEnd(event)}>
      {/* Search flattens the tree, so dragging is disabled while filtering: the visible
          order is no longer the sibling order the drop would write. */}
      <SortableContext items={visible.map((row) => row.id)} strategy={verticalListSortingStrategy}>
        <div className="divide-y overflow-hidden rounded-xl border">
          {visible.map((row) => <PageRow key={row.id} row={row} sortable={!searching}>{rowBody(row)}</PageRow>)}
        </div>
      </SortableContext>
    </DndContext>}
  </div>;
}
