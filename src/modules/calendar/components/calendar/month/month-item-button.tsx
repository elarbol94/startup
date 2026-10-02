"use client";

// A draggable, selectable calendar item inside the month grid: either a spanning
// bar or a compact single-day row ("09:00 Titel" with a coloured dot).
// Used by month-week-row.tsx.
import type { CSSProperties, DragEvent } from "react";
import type { CalendarItem } from "../../../types";
import { cn } from "@/lib/utils";
import { SourceIcon } from "../source-icon";

type Handlers = {
  selected: boolean;
  onSelect: (item: CalendarItem) => void;
  onDragStart: (event: DragEvent, item: CalendarItem) => void;
  onDragEnd: () => void;
};

const BASE =
  "flex min-w-0 items-center gap-1 text-left text-[10px] leading-4 outline-none focus-visible:ring-2 focus-visible:ring-ring";
const SELECTED = "ring-2 ring-[#6D5EF7] ring-offset-1 ring-offset-background";

export function MonthBarButton({
  item,
  continuesBefore,
  continuesAfter,
  style,
  selected,
  onSelect,
  onDragStart,
  onDragEnd,
}: Handlers & {
  item: CalendarItem;
  continuesBefore: boolean;
  continuesAfter: boolean;
  style: CSSProperties;
}) {
  return (
    <button
      type="button"
      draggable={item.editable}
      onDragStart={(event) => onDragStart(event, item)}
      onDragEnd={onDragEnd}
      onClick={() => onSelect(item)}
      title={item.title}
      className={cn(
        BASE,
        "z-10 my-px h-5 rounded-md border-l-[3px] bg-background px-1.5 font-medium shadow-sm hover:ring-1 hover:ring-foreground/15",
        continuesBefore ? "ml-0 rounded-l-none border-l-0 pl-2" : "ml-1",
        continuesAfter ? "mr-0 rounded-r-none" : "mr-1",
        selected && SELECTED,
      )}
      style={{ ...style, borderLeftColor: item.color, backgroundColor: `color-mix(in srgb, ${item.color} 14%, var(--background))` }}
    >
      <SourceIcon kind={item.kind} />
      <span className="min-w-0 flex-1 truncate">{item.title}</span>
    </button>
  );
}

export function MonthEntryButton({
  item,
  time,
  selected,
  onSelect,
  onDragStart,
  onDragEnd,
}: Handlers & { item: CalendarItem; time: string | null }) {
  return (
    <button
      type="button"
      draggable={item.editable}
      onDragStart={(event) => onDragStart(event, item)}
      onDragEnd={onDragEnd}
      onClick={() => onSelect(item)}
      title={time ? `${time} ${item.title}` : item.title}
      className={cn(
        BASE,
        "h-5 w-full shrink-0 rounded px-1 hover:bg-muted",
        item.allDay && "bg-muted/50",
        selected && SELECTED,
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} aria-hidden />
      {time && <span className="shrink-0 font-mono text-[9px] tabular-nums text-muted-foreground">{time}</span>}
      <span className="min-w-0 flex-1 truncate">{item.title}</span>
    </button>
  );
}
