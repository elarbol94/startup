"use client";
import { useContext, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { DndContext, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cycleSort, parseColumnOrder, reorderColumns, parseColumnWidths, clampColumnWidth, parseTablePreferences, sortFromUrl, sortTableRows, type TablePreferences } from "../overview-table-model";
import { OverviewEditingContext, useOverviewPreference } from "./overview-preferences";
export type OverviewColumn<T> = { id: string; label: string; value: (row: T) => string | number | null; render?: (row: T) => ReactNode; width?: number };
export function useOverviewTable<T extends { id: string }>(id: string, rows: T[], columns: OverviewColumn<T>[], sortParam?: string) {
  const locale = useLocale();
  const storage = useOverviewPreference(`table:${id}`);
  const params = useSearchParams();
  const orderStorage = useOverviewPreference(`table-order:${id}`);
  const order = parseColumnOrder(orderStorage.raw, columns.map(column => column.id));
  const orderedColumns = order.map(id => columns.find(column => column.id === id)!);
  const widthStorage = useOverviewPreference(`table-widths:${id}`);
  const widths = parseColumnWidths(widthStorage.raw, columns.map(column => column.id));
  const preferences = parseTablePreferences(storage.raw, columns.map(column => column.id));
  const urlValue = sortParam ? params.get(sortParam) : null;
  const rules = urlValue !== null ? sortFromUrl(urlValue, preferences.visible) : preferences.sort;
  const save = (next: TablePreferences) => {
    storage.save(next);
    if (sortParam) {
      const query = new URLSearchParams(window.location.search);
      query.set(sortParam, next.sort.length ? next.sort.map(rule => `${rule.id}:${rule.direction}`).join(",") : "default");
      window.history.replaceState(null, "", `?${query.toString()}`);
    }
  };
  return {
    id, columns: orderedColumns, reorder: (active: string, target: string) => orderStorage.save(reorderColumns(order, active, target)), visible: preferences.visible, rules, widths, failed: storage.failed || widthStorage.failed || orderStorage.failed,
    resizeColumn: (columnId: string, width: number) => widthStorage.save({ ...widths, [columnId]: clampColumnWidth(width) }),
    rows: sortTableRows(rows, rules, Object.fromEntries(columns.map(column => [column.id, column.value])), locale),
    toggleColumn: (columnId: string) => {
      const visible = preferences.visible.includes(columnId) ? preferences.visible.filter(id => id !== columnId) : [...preferences.visible, columnId];
      if (visible.length) save({ visible, sort: rules.filter(rule => visible.includes(rule.id)) });
    },
    sortBy: (columnId: string) => save({ visible: preferences.visible, sort: cycleSort(rules, columnId) }),
    resetSort: () => save({ visible: preferences.visible, sort: [] }),
  };
}
type TableController<T extends { id: string }> = ReturnType<typeof useOverviewTable<T>>;
export function OverviewColumnPicker<T extends { id: string }>({ table }: { table: TableController<T> }) {
  const t = useTranslations("overviewLayout");
  const editing = useContext(OverviewEditingContext);
  if (!editing) return null;
  return <Popover><PopoverTrigger render={<Button variant="ghost" size="sm" aria-label={t("columns")} />}><Columns3 className="size-4" />{t("columns")}</PopoverTrigger>
    <PopoverContent align="end" className="w-64 p-4">
      <p className="mb-2 text-sm font-medium">{t("columns")}</p>
      {table.columns.map(column => <label key={column.id} className="flex cursor-pointer items-center gap-2 py-1.5 text-sm"><input type="checkbox" checked={table.visible.includes(column.id)} disabled={table.visible.length === 1 && table.visible.includes(column.id)} onChange={() => table.toggleColumn(column.id)} />{column.label}</label>)}
      <p className="mt-3 text-xs text-muted-foreground">{t("multiSortHint")}</p>
      {!!table.rules.length && <Button variant="ghost" size="sm" className="mt-2" onClick={table.resetSort}>{t("resetSorting")}</Button>}
    </PopoverContent>
  </Popover>;
}
function DraggableHeading({ id, label, children, ...props }: { id: string; label: string; children: (handle: Pick<ReturnType<typeof useSortable>, "attributes" | "listeners">) => ReactNode; style: CSSProperties; "aria-sort": "none" | "other" | "ascending" | "descending" }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id });
  return <th ref={setNodeRef} scope="col" {...props} className="relative px-3 py-2 font-medium" style={{ ...props.style, transform: CSS.Translate.toString(transform), transition: transition, zIndex: isDragging ? 30 : undefined, opacity: isDragging ? .7 : undefined }} data-column-id={id} data-column-label={label}>{children({ attributes, listeners })}</th>;
}
export function OverviewTable<T extends { id: string }>({ table, label, empty, actions, pending }: { table: TableController<T>; label: string; empty: ReactNode; actions?: (row: T) => ReactNode; pending?: boolean }) {
  const t = useTranslations("overviewLayout");
  const [resizing, setResizing] = useState<{ id: string; width: number } | null>(null);
  const start = useRef<{ id: string; x: number; width: number } | null>(null);
  const cancel = () => { start.current = null; setResizing(null); };
  const widthOf = (column: OverviewColumn<T>) => resizing?.id === column.id ? resizing.width : table.widths[column.id] ?? column.width ?? 150;
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 8 } }), useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }));
  const visible = table.columns.filter(column => table.visible.includes(column.id));
  return <div role="region" aria-label={label} tabIndex={0} aria-busy={pending} className={`min-h-0 flex-1 overflow-auto focus-visible:outline-2 focus-visible:outline-ring ${pending ? "opacity-55" : ""}`}>
    {table.failed && <p role="status" className="p-3 text-xs text-destructive">{t("saveFailed")}</p>}
    <DndContext id={`columns-${table.id}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => { if (over) table.reorder(String(active.id), String(over.id)); }} accessibility={{ screenReaderInstructions: { draggable: t("columnDragInstructions") }, announcements: { onDragStart: ({ active }) => t("columnDragStart", { column: table.columns.find(column => column.id === active.id)?.label ?? "" }), onDragOver: ({ over }) => over ? t("columnDragOver", { column: table.columns.find(column => column.id === over.id)?.label ?? "" }) : undefined, onDragEnd: () => t("columnDragEnd"), onDragCancel: () => t("columnDragCancel") } }}><SortableContext items={visible.map(column => column.id)} strategy={horizontalListSortingStrategy}>
    <table className="w-full table-fixed text-left text-sm" style={{ width: visible.reduce((sum, column) => sum + widthOf(column), actions ? 48 : 0), minWidth: "100%" }}>
      <thead className="sticky top-0 z-10 bg-muted text-xs text-muted-foreground"><tr>
        {visible.map(column => {
          const index = table.rules.findIndex(rule => rule.id === column.id);
          const rule = table.rules[index];
          const Icon = rule?.direction === "asc" ? ArrowUp : rule?.direction === "desc" ? ArrowDown : ArrowUpDown;
          return <DraggableHeading key={column.id} id={column.id} label={column.label} style={{ width: widthOf(column) }} aria-sort={!rule ? "none" : index ? "other" : rule.direction === "asc" ? "ascending" : "descending"}>
            {handle => <><button type="button" {...handle.attributes} {...handle.listeners} onClick={() => table.sortBy(column.id)} aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight" onKeyDown={event => {
              if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
                event.preventDefault(); event.stopPropagation();
                const target = visible[visible.findIndex(entry => entry.id === column.id) + (event.key === "ArrowRight" ? 1 : -1)];
                if (target) table.reorder(column.id, target.id);
              }
            }} title={t("columnHeaderHint")} aria-label={t("sortColumn", { column: column.label })} className="inline-flex max-w-full cursor-grab items-center gap-1.5 rounded py-1 text-left hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
              <span className="truncate">{column.label}</span><Icon aria-hidden className={`size-3 shrink-0 ${rule ? "text-foreground" : "opacity-40"}`} />
              {rule && table.rules.length > 1 && <span className="text-[10px] tabular-nums" aria-label={t("sortPriority", { priority: index + 1 })}>{index + 1}</span>}
            </button>
            <div role="separator" tabIndex={0} aria-orientation="vertical" aria-label={t("resizeColumn", { column: column.label })} aria-valuemin={48} aria-valuemax={1200} aria-valuenow={Math.round(widthOf(column))}
              className="absolute -right-1 top-0 z-20 h-full w-2 touch-none cursor-col-resize hover:bg-primary/40 focus-visible:bg-primary/40 focus-visible:outline-none"
              onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); event.currentTarget.focus(); start.current = { id: column.id, x: event.clientX, width: event.currentTarget.parentElement!.getBoundingClientRect().width }; event.currentTarget.setPointerCapture(event.pointerId); }}
              onPointerMove={event => { if (start.current) setResizing({ id: column.id, width: clampColumnWidth(start.current.width + event.clientX - start.current.x) }); }}
              onPointerUp={event => { if (!start.current) return; table.resizeColumn(column.id, start.current.width + event.clientX - start.current.x); cancel(); }}
              onPointerCancel={cancel} onLostPointerCapture={cancel}
              onKeyDown={event => { if (event.key === "Escape") cancel(); if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); table.resizeColumn(column.id, widthOf(column) + (event.key === "ArrowRight" ? 10 : -10)); } }} />
          </>}</DraggableHeading>;
        })}
        {actions && <th className="w-12"><span className="sr-only">{t("actions")}</span></th>}
        <th aria-hidden="true" className="p-0" />
      </tr></thead>
      <tbody className="divide-y">{table.rows.map(row => <tr key={row.id} className="hover:bg-muted/30">
        {visible.map(column => <td key={column.id} className="truncate px-3 py-3" title={String(column.value(row) ?? "")}>
          {column.render ? column.render(row) : column.value(row) ?? "—"}
        </td>)}
        {actions && <td className="px-2 py-2">{actions(row)}</td>}
        <td aria-hidden="true" className="p-0" />
      </tr>)}</tbody>
    </table></SortableContext></DndContext>
    {!table.rows.length && <div className="grid min-h-36 place-items-center p-6 text-center text-sm text-muted-foreground">{empty}</div>}
  </div>;
}
