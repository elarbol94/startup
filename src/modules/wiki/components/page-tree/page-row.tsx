"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { ChevronRight, Clock3, FileText, GripVertical } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { UserIdentity } from "@/components/user-identity";
import { RowSelectCheckbox } from "@/components/row-selection";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RowSelection } from "@/lib/use-row-selection";
import { parseTagList } from "../../lib/tags";
import { INDENT, type Row } from "./page-tree-types";
import { PageRowMenu } from "./page-row-menu";
import type { PageActions } from "./use-page-actions";

export function PageRow({ row, sortable, searching, childCount, collapsed, onToggle, selection, actions }: {
  row: Row;
  sortable: boolean;
  searching: boolean;
  childCount: number;
  collapsed: boolean;
  onToggle: () => void;
  selection: RowSelection;
  actions: PageActions;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id, disabled: !sortable });
  const t = useTranslations("wiki");
  const format = useFormatter();
  const tags = parseTagList(row.tags);
  const children = searching ? 0 : childCount;
  const selected = selection.isSelected(row.id);
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        paddingLeft: `${44 + row.depth * INDENT}px`,
        opacity: isDragging ? 0.6 : 1,
      }}
      data-depth={row.depth}
      data-selected={selected || undefined}
      data-testid="page-tree-row"
      className="group relative flex min-h-11 flex-wrap items-center gap-x-2 gap-y-0.5 bg-card py-1.5 pr-2 transition-colors hover:bg-muted/40 data-selected:bg-accent/60"
    >
      {/* Indent guides: one hairline per ancestor level so siblings visibly line up. */}
      {Array.from({ length: row.depth }, (_, level) => (
        <span key={level} aria-hidden className="pointer-events-none absolute inset-y-0 w-px bg-border" style={{ left: `${52 + level * INDENT}px` }} />
      ))}
      <span className={cn("absolute top-1/2 left-3 flex -translate-y-1/2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100", (selection.count > 0) && "opacity-100")}>
        <RowSelectCheckbox id={row.id} label={row.title} selection={selection} />
      </span>
      {sortable && (
        <button
          type="button"
          className="absolute top-1/2 left-7 shrink-0 -translate-y-1/2 cursor-grab touch-none rounded p-0.5 text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
          aria-label={t("reorderPage", { title: row.title })}
          data-testid="page-drag-handle"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      )}
      {children > 0 ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={t(collapsed ? "workspace.expandPage" : "workspace.collapsePage", { title: row.title })}
          className="-ml-1 grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight className={cn("size-4 transition-transform motion-reduce:transition-none", !collapsed && "rotate-90")} />
        </button>
      ) : <span aria-hidden className="-ml-1 size-6 shrink-0" />}
      <Link href={`/wiki/pages/${row.slug}`} className="flex min-w-0 flex-1 basis-[calc(100%-5rem)] items-center gap-2 py-1 sm:basis-auto">
        <FileText className="size-4 shrink-0 text-muted-foreground/60" />
        <span className={cn("truncate text-sm", row.depth === 0 && !searching ? "font-semibold" : "font-medium")}>{row.title}</span>
        {children > 0 && collapsed && <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground tabular-nums">{t("workspace.childCount", { count: children })}</span>}
      </Link>
      <span className="flex basis-full flex-wrap items-center gap-x-2 gap-y-0.5 pl-8 sm:basis-auto sm:pl-0">
        {tags.slice(0, 2).map((item) => <Link key={item.id} href={`/wiki/tags/${item.id}`} className="rounded bg-muted/60 px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground">{item.name}</Link>)}
        {tags.length > 2 && <Popover><PopoverTrigger render={<Button size="xs" variant="ghost" aria-label={t("workspace.moreTags", { count: tags.length - 2 })} />}>+{tags.length - 2}</PopoverTrigger><PopoverContent className="flex w-60 flex-wrap gap-2">{tags.slice(2).map((item) => <Link key={item.id} href={`/wiki/tags/${item.id}`} className="rounded-md bg-muted px-2 py-1 text-xs">{item.name}</Link>)}</PopoverContent></Popover>}
        <span className="w-20 text-[11px] text-muted-foreground" data-testid="page-status">{t(`pageStatuses.${row.status}`)}</span>
        <span className="hidden w-36 items-center gap-1 text-[11px] text-muted-foreground lg:flex"><UserIdentity userId={row.updatedBy} name={row.updatedByName} compact /></span>
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums"><Clock3 className="size-3" />{format.dateTime(new Date(row.updatedAt), { dateStyle: "medium" })}</span>
        <PageRowMenu page={row} actions={actions} className="opacity-60 group-hover:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100" />
      </span>
    </div>
  );
}
