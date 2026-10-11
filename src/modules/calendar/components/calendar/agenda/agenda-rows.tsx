"use client";

// Row components of the agenda view: compact timed rows and single-line all-day/task rows.
// Used by agenda-day.tsx.
import type { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { CalendarItem } from "../../../types";
import { CalendarItemPeople } from "../calendar-item-people";
import { SourceIcon } from "../source-icon";
import { formatShortDate, formatTime } from "./agenda-utils";

export type AgendaT = ReturnType<typeof useTranslations<"calendar">>;

type RowProps = {
  item: CalendarItem;
  until: string | null;
  locale: string;
  timezone: string;
  t: AgendaT;
  selected: boolean;
  past?: boolean;
  onSelect: (item: CalendarItem) => void;
};

function rowClass(selected: boolean, past: boolean) {
  return cn(
    "flex w-full min-w-0 items-center gap-3 rounded-md px-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    selected && "bg-brand-soft ring-1 ring-brand/40 hover:bg-brand-soft",
    past && !selected && "opacity-55",
  );
}

/** Timed item (design 1b event block): calendar-colour left border, time column, title and one muted detail line. */
export function AgendaTimedRow({ item, until, locale, timezone, t, selected, past = false, onSelect }: RowProps) {
  const detail = [
    until ? t("untilDate", { date: formatShortDate(until, locale) }) : "",
    item.location,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      aria-pressed={selected}
      className={cn(
        "flex w-full min-w-0 items-center gap-3 rounded-md border-l-[3px] px-2.5 py-2 text-left transition-shadow hover:ring-1 hover:ring-foreground/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected && "ring-2 ring-brand hover:ring-2 hover:ring-brand",
        past && !selected && "opacity-55",
        "min-h-11",
      )}
      style={{ borderLeftColor: item.color, backgroundColor: `color-mix(in oklab, ${item.color} 14%, var(--card))` }}
    >
      <span className="w-[4.25rem] shrink-0 font-mono text-[11.5px] leading-4 tabular-nums">
        <span className="block font-medium">{formatTime(item.startAt!, locale, timezone)}</span>
        {item.endAt && (
          <span className="block text-muted-foreground">
            {until ? "…" : formatTime(item.endAt, locale, timezone)}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-muted-foreground">
            <SourceIcon kind={item.kind} />
          </span>
          <span className="truncate text-[13.5px] font-medium">{item.title}</span>
        </span>
        {detail && <span className="block truncate text-xs text-muted-foreground">{detail}</span>}
      </span>
      <CalendarItemPeople item={item} compact />
    </button>
  );
}

/** Single-line row for all-day items, tasks and ongoing items. */
export function AgendaCompactRow({
  item,
  until,
  locale,
  t,
  selected,
  onSelect,
  label,
}: Omit<RowProps, "timezone" | "past"> & { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      aria-pressed={selected}
      className={cn(rowClass(selected, false), "min-h-8 py-1 text-xs")}
    >
      {label !== undefined && (
        <span className="w-[4.75rem] shrink-0 truncate text-muted-foreground">{label}</span>
      )}
      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} aria-hidden />
      <span className="shrink-0 text-muted-foreground">
        <SourceIcon kind={item.kind} />
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{item.title}</span>
      {until && (
        <span className="shrink-0 text-muted-foreground">
          {t("untilDate", { date: formatShortDate(until, locale) })}
        </span>
      )}
      <CalendarItemPeople item={item} compact />
    </button>
  );
}
