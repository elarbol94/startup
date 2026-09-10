"use client";

import { useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { addDays } from "../date-utils";
import { adjustEventRange, timedDaySegment, type TimeDragMode } from "../event-time";
import type { CalendarItem } from "../types";
import { cn } from "@/lib/utils";

export function TimelineEvent({ item, day, timezone, column, columns, onSelect, onEdit, onCommit }: {
  item: CalendarItem;
  day: string;
  timezone: string;
  column: number;
  columns: number;
  onSelect: (item: CalendarItem) => void;
  onEdit: (item: CalendarItem) => void;
  onCommit: (item: CalendarItem, startAt: string, endAt: string) => Promise<boolean>;
}) {
  const t = useTranslations("calendar");
  const [preview, setPreview] = useState<{ startAt: string; endAt: string; dayOffset: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const drag = useRef<{ mode: TimeDragMode; x: number; y: number; scroll: number; width: number; viewport: HTMLElement; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const segment = timedDaySegment(preview?.startAt ?? item.startAt, preview?.endAt ?? item.endAt, addDays(day, preview?.dayOffset ?? 0), timezone);
  const original = timedDaySegment(item.startAt, item.endAt, day, timezone)!;
  const editable = item.editable && (item.kind === "event" || item.kind === "focus") && !saving;
  const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  const display = segment ?? original;
  const label = `${item.title} · ${clock(display.start)}–${clock(display.end)}`;

  function begin(event: PointerEvent<HTMLButtonElement>, mode: TimeDragMode) {
    if (!editable || event.button !== 0) return;
    const parent = event.currentTarget.closest<HTMLElement>("[data-calendar-day]")!;
    const viewport = parent.closest<HTMLElement>("[data-testid=calendar-week-scroll]")!;
    drag.current = { mode, x: event.clientX, y: event.clientY, width: parent.getBoundingClientRect().width, scroll: viewport.scrollTop, viewport, moved: false };
    suppressClick.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.stopPropagation();
  }
  function rangeAt(event: PointerEvent<HTMLButtonElement>) {
    const state = drag.current!;
    const dayOffset = Math.round((event.clientX - state.x) / state.width);
    return { ...adjustEventRange(item.startAt!, item.endAt!, state.mode, event.clientY - state.y + state.viewport.scrollTop - state.scroll, dayOffset, timezone), dayOffset: state.mode === "move" ? dayOffset : 0 };
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const state = drag.current;
    if (!state) return;
    if (Math.abs(event.clientX - state.x) + Math.abs(event.clientY - state.y) < 4 && !state.moved) return;
    state.moved = true;
    const bounds = state.viewport.getBoundingClientRect();
    if (event.clientY > bounds.bottom - 24) state.viewport.scrollTop += 12;
    if (event.clientY < bounds.top + 100) state.viewport.scrollTop -= 12;
    setPreview(rangeAt(event));
  }
  async function commit(range: { startAt: string; endAt: string }) {
    setSaving(true);
    // A successful refresh remounts this card with its new updatedAt version.
    // Keep it disabled until then so a second gesture cannot submit stale data.
    const saved = await onCommit(item, range.startAt, range.endAt);
    if (!saved) { setSaving(false); setPreview(null); }
  }
  function end(event: PointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    const moved = drag.current.moved;
    const range = rangeAt(event);
    drag.current = null;
    suppressClick.current = moved;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (moved) void commit(range);
    else setPreview(null);
  }
  function cancel() { drag.current = null; setPreview(null); suppressClick.current = true; }
  function key(event: KeyboardEvent<HTMLButtonElement>, mode: TimeDragMode) {
    if (!editable || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const range = adjustEventRange(item.startAt!, item.endAt!, mode, event.key === "ArrowUp" ? -15 : event.key === "ArrowDown" ? 15 : 0, event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0, timezone);
    void commit(range);
  }
  const handlers = { onPointerMove: move, onPointerUp: end, onPointerCancel: cancel };
  return (
    <div data-calendar-event={item.sourceId} className={cn("group absolute z-10 rounded border border-l-[3px] bg-background shadow-sm focus-within:z-20 hover:z-20", saving && "opacity-60", preview && "z-40 ring-2 ring-ring")}
      style={{ top: display.start, height: Math.max(24, display.end - display.start), left: `calc(${column * 100 / columns + (preview?.dayOffset ?? 0) * 100}% + 2px)`, width: `calc(${100 / columns}% - 4px)`, borderLeftColor: item.calendarId ? item.color : "var(--muted-foreground)" }}>
      <button type="button" className={cn("flex h-full w-full flex-col items-start justify-start overflow-clip px-1 py-1 text-left text-[10px] outline-none focus-visible:ring-2 focus-visible:ring-ring", editable && "touch-none cursor-grab active:cursor-grabbing")}
        aria-label={label} title={`${label}${item.assigneeName ? ` · ${item.assigneeName}` : ""}`} disabled={saving}
        onPointerDown={(event) => begin(event, "move")} {...handlers} onKeyDown={(event) => key(event, "move")}
        onClick={() => { if (!suppressClick.current) onSelect(item); suppressClick.current = false; }} onDoubleClick={() => { if (item.editable) onEdit(item); }}>
        <span className="sticky top-36 block w-full">
        <span className="block truncate font-semibold">{!original.startsHere ? "← " : ""}{item.title}{!original.endsHere ? " →" : ""}</span>
        <span className="block truncate text-[9px] tabular-nums text-muted-foreground">{clock(display.start)}–{clock(display.end)}</span>
        {columns === 1 && item.assigneeName && <span className="block truncate text-[9px] text-muted-foreground">{item.assigneeName}</span>}
        </span>
      </button>
      {editable && original.startsHere && <button type="button" aria-label={t("resizeStart", { title: item.title })}
        title={t("dragQuarterHour")} className="absolute inset-x-0 -top-1 z-20 h-2 cursor-ns-resize touch-none opacity-0 hover:opacity-100 focus:opacity-100 group-hover:opacity-100"
        onPointerDown={(event) => begin(event, "start")} {...handlers} onKeyDown={(event) => key(event, "start")} onClick={(event) => event.stopPropagation()}>
        <span className="mx-auto block h-0.5 w-4 max-w-full rounded bg-foreground/70" />
      </button>}
      {editable && original.endsHere && <button type="button" aria-label={t("resizeEnd", { title: item.title })}
        title={t("dragQuarterHour")} className="absolute inset-x-0 -bottom-1 z-20 h-2 cursor-ns-resize touch-none opacity-0 hover:opacity-100 focus:opacity-100 group-hover:opacity-100"
        onPointerDown={(event) => begin(event, "end")} {...handlers} onKeyDown={(event) => key(event, "end")} onClick={(event) => event.stopPropagation()}>
        <span className="mx-auto block h-0.5 w-4 max-w-full rounded bg-foreground/70" />
      </button>}

    </div>
  );
}
