"use client";
import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, pointerWithin, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, RotateCcw, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cardIds, clampSize, defaultLayout, isCard, moveSection, parseLayout, resizeFromEdge, sectionIds, type LayoutItem, type ResizeEdge, type WidgetId } from "../overview-layout";
import { OverviewEditingContext, OverviewUserContext, useOverviewPreference, useOverviewReady } from "./overview-preferences";
import styles from "./overview-workspace.module.css";
const edges: ResizeEdge[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
type Guide = { axis: "x" | "y"; position: number };
function Panel({ item, editing, children, update, guide }: { item: LayoutItem; editing: boolean; children: ReactNode; update: (patch: Partial<LayoutItem>) => void; guide: (id?: WidgetId, rect?: { left: number; top: number; width: number; height: number }) => void }) {
  const t = useTranslations("overviewLayout");
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: item.id, disabled: !editing });
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const start = useRef<{ x: number; y: number; item: LayoutItem; column: number; edge: ResizeEdge } | null>(null);
  const resized = (x: number, y: number) => resizeFromEdge(start.current!.item, start.current!.edge, x - start.current!.x, y - start.current!.y, start.current!.column);
  const cancel = () => { start.current = null; setSize(null); guide(); };
  return <div ref={setNodeRef} data-overview-section={item.id} data-card={isCard(item.id)} className={`${styles.panel} rounded-2xl border bg-card shadow-sm ${editing ? "ring-1 ring-border" : ""} ${isDragging ? "z-40 opacity-70" : ""}`}
    style={{ "--panel-width": size?.width ?? item.width, "--panel-height": `${size?.height ?? item.height}px`, transform: CSS.Transform.toString(transform), transition: size ? undefined : transition } as CSSProperties}>
    {editing && <div className="flex items-center justify-between rounded-t-2xl border-b bg-muted/30 px-2 py-1">
      <button type="button" className="flex min-w-0 flex-1 touch-none cursor-grab items-center gap-2 rounded p-2 text-left text-xs text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring" aria-label={t("move", { section: t(item.id) })} {...attributes} {...listeners}><GripVertical className="size-3.5 shrink-0" /><span className="truncate">{t(item.id)}</span></button>
      <Button variant="ghost" size="icon-sm" onClick={() => update({ visible: false })} aria-label={t("hide", { section: t(item.id) })}><X className="size-3.5" /></Button>
    </div>}
    <div className={styles.content}>{children}</div>
    {editing && edges.map(edge => <div key={edge} data-edge={edge} role="separator" tabIndex={0}
      aria-orientation={edge === "n" || edge === "s" ? "horizontal" : "vertical"}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(edge === "n" || edge === "s" ? (size?.height ?? item.height) / 10 : (size?.width ?? item.width) / 12 * 100)}
      aria-label={t("resizeEdge", { section: t(item.id), edge: t(`edges.${edge}`) })} title={t("resizeHint")} className={styles.edge}
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.preventDefault(); event.stopPropagation(); event.currentTarget.focus();
        const grid = event.currentTarget.parentElement?.parentElement;
        start.current = { x: event.clientX, y: event.clientY, item, edge, column: grid ? (grid.clientWidth + 20) / 12 : 100 };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => { if (start.current) {
        const next = resized(event.clientX, event.clientY); setSize(next);
        const rect = event.currentTarget.parentElement!.getBoundingClientRect();
        guide(item.id, { left: rect.left, top: rect.top, width: next.width * start.current.column - 20, height: rect.height + next.height - (size?.height ?? item.height) });
      } }}
      onPointerUp={event => { if (!start.current) return; const next = resized(event.clientX, event.clientY); cancel(); update(next); }}
      onPointerCancel={cancel} onLostPointerCapture={cancel}
      onKeyDown={event => {
        if (event.key === "Escape") { cancel(); return; }
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault(); update(clampSize(item.id, item.width + (event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0), item.height + (event.key === "ArrowDown" ? 20 : event.key === "ArrowUp" ? -20 : 0)));
      }} />)}
  </div>;
}
function Workspace({ userId, widgets }: { userId: string; widgets: Record<WidgetId, ReactNode> }) {
  const t = useTranslations("overviewLayout");
  const ready = useOverviewReady();
  const storage = useOverviewPreference("layout", `management:overview-layout:v1:${userId}`);
  const items = useMemo(() => parseLayout(storage.raw), [storage.raw]);
  const [editing, setEditing] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const guide = (id?: WidgetId, rect?: { left: number; top: number; width: number; height: number }) => {
    const grid = gridRef.current;
    if (!grid || !id || !rect) { setGuides([]); return; }
    const bounds = grid.getBoundingClientRect();
    const others = Array.from(grid.querySelectorAll<HTMLElement>("[data-overview-section]")).filter(node => node.dataset.overviewSection !== id).map(node => node.getBoundingClientRect());
    const result: Guide[] = [];
    for (const axis of ["x", "y"] as const) {
      const start = axis === "x" ? "left" : "top", length = axis === "x" ? "width" : "height";
      const targets = [bounds[start], bounds[start] + bounds[length], ...others.flatMap(box => [box[start], box[start] + box[length] / 2, box[start] + box[length]])];
      const moving = [rect[start], rect[start] + rect[length] / 2, rect[start] + rect[length]];
      for (const target of targets) if (moving.some(value => Math.abs(value - target) <= 5) && !result.some(line => line.axis === axis && Math.abs(line.position - (target - bounds[start])) < 1)) result.push({ axis, position: target - bounds[start] });
    }
    setGuides(result);
  };
  const save = (next: LayoutItem[]) => storage.save({ version: 2, items: next });
  const visible = items.filter(item => item.visible);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  if (!ready) return <div role="status" aria-busy="true" className="grid min-h-64 place-items-center rounded-2xl border border-dashed text-sm text-muted-foreground">{t("loadingWorkspace")}</div>;
  return <OverviewEditingContext.Provider value={editing}><div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">{editing ? t("hint") : t("workspace")}</p>
      <div className="flex flex-wrap items-center gap-2">
        {editing && <>
          <Popover open={catalogOpen} onOpenChange={setCatalogOpen}><PopoverTrigger render={<Button variant="outline" size="sm" />}><Plus className="size-4" />{t("addWidgets")}</PopoverTrigger>
            <PopoverContent align="end" className="max-h-[70dvh] w-[min(34rem,calc(100vw-2rem))] overflow-y-auto p-5">
              <div className="grid gap-6 sm:grid-cols-2">{[{ title: "cards", ids: cardIds }, { title: "sections", ids: sectionIds }].map(group => <div key={group.title}>
                <h3 className="mb-3 text-sm font-semibold">{t(group.title)}</h3>
                {group.ids.map(id => <label key={id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted"><input type="checkbox" checked={items.find(item => item.id === id)!.visible} onChange={event => save(items.map(item => item.id === id ? { ...item, visible: event.target.checked } : item))} />{t(id)}</label>)}
              </div>)}</div>
            </PopoverContent>
          </Popover>
          <Button variant="ghost" size="sm" onClick={() => save(defaultLayout)}><RotateCcw className="size-3.5" />{t("reset")}</Button>
        </>}
        <Button variant={editing ? "default" : "outline"} size="sm" onClick={() => { setEditing(!editing); setCatalogOpen(false); }}>{editing ? t("done") : t("customize")}</Button>
      </div>
    </div>
    {storage.failed && <p role="status" className="text-sm text-destructive">{t("saveFailed")}</p>}
    {!visible.length && <div className="rounded-2xl border border-dashed p-10 text-center"><p className="mb-3 text-muted-foreground">{t("empty")}</p><Button variant="outline" onClick={() => { setEditing(true); setCatalogOpen(true); }}>{t("addWidgets")}</Button></div>}
    <DndContext id="overview-layout" accessibility={{ screenReaderInstructions: { draggable: t("dragInstructions") }, announcements: {
      onDragStart: ({ active }) => t("dragStart", { section: t(active.id as WidgetId) }), onDragOver: ({ over }) => over ? t("dragOver", { section: t(over.id as WidgetId) }) : undefined,
      onDragEnd: () => t("dragEnd"), onDragCancel: () => t("dragCancel"),
    } }} sensors={sensors} collisionDetection={args => { const hits = pointerWithin(args); return hits.length ? hits : closestCenter(args); }} onDragMove={({ active }) => { const rect = active.rect.current.translated; if (rect) guide(active.id as WidgetId, rect); }} onDragCancel={() => guide()} onDragEnd={({ active, over }) => { guide(); if (over && active.id !== over.id) save(moveSection(items, active.id as WidgetId, over.id as WidgetId)); }}>
      <SortableContext items={visible.map(item => item.id)} strategy={rectSortingStrategy}><div ref={gridRef} className={styles.grid}>{visible.map(item => <Panel key={item.id} item={item} editing={editing} guide={guide} update={patch => save(items.map(entry => entry.id === item.id ? { ...entry, ...patch } : entry))}>{widgets[item.id]}</Panel>)}{guides.map((line, index) => <div key={index} aria-hidden="true" data-alignment-guide={line.axis} className={styles.guide} style={line.axis === "x" ? { left: line.position, top: 0, bottom: 0, width: 1 } : { top: line.position, left: 0, right: 0, height: 1 }} />)}</div></SortableContext>
    </DndContext>
  </div></OverviewEditingContext.Provider>;
}
export function OverviewWorkspace(props: { userId: string; widgets: Record<WidgetId, ReactNode> }) {
  return <OverviewUserContext.Provider value={props.userId}><Workspace {...props} /></OverviewUserContext.Provider>;
}
