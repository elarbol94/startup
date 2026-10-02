"use client";

// One horizontal all-day bar (event, absence, task or project span) in the week header.
import type { DragEvent } from "react";
import { addDays } from "../../../date-utils";
import type { AllDayBar } from "../../../multi-day";
import type { CalendarItem } from "../../../types";
import { cn } from "@/lib/utils";
import { SourceIcon } from "../source-icon";

export function AllDayBarButton({
  bar,
  days,
  draggingId,
  selected,
  onSelect,
  onDragStart,
  onDragEnd,
  onDropDay,
}: {
  bar: AllDayBar<CalendarItem>;
  days: string[];
  draggingId: string | null;
  selected: boolean;
  onSelect: (item: CalendarItem) => void;
  onDragStart: (event: DragEvent, item: CalendarItem) => void;
  onDragEnd: () => void;
  onDropDay: (event: DragEvent, day: string) => void;
}) {
  const { item, lane, startColumn, endColumn } = bar;
  return (
    <button
      type="button"
      draggable={item.editable}
      onDragStart={(event) => onDragStart(event, item)}
      onDragEnd={onDragEnd}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const span = endColumn - startColumn;
        const offset = Math.min(span - 1, Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * span)));
        onDropDay(event, days[startColumn + offset]);
      }}
      onClick={() => onSelect(item)}
      className={cn(
        "group z-10 mx-1 my-0.5 flex min-w-0 items-center gap-1.5 rounded-md border-l-[3px] px-1.5 py-1 text-left text-[10px] text-foreground shadow-sm outline-none hover:ring-1 hover:ring-foreground/15 focus-visible:ring-2 focus-visible:ring-ring",
        item.startDate! < days[0] && "rounded-l-none",
        item.endDate! > addDays(days[days.length - 1], 1) && "rounded-r-none",
        draggingId === item.id && "opacity-45",
        selected && "ring-2 ring-primary hover:ring-primary",
      )}
      style={{
        gridColumn: `${startColumn + 2} / ${endColumn + 2}`,
        gridRow: lane + 1,
        borderLeftColor: item.color,
        backgroundColor: `color-mix(in srgb, ${item.color} 14%, var(--background))`,
      }}
      title={item.title}
    >
      <SourceIcon kind={item.kind} />
      <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
    </button>
  );
}
