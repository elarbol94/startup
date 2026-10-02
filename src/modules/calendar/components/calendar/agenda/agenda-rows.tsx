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
    "flex w-full min-w-0 items-center gap-3 rounded-lg px-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    selected && "bg-primary/10 ring-1 ring-primary/30 hover:bg-primary/15",
    past && !selected && "opacity-55",
  );
}

/** Timed item: time column, colour bar, title and one muted detail line. */
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
      className={cn(rowClass(selected, past), "min-h-11 py-1")}
    >
      <span className="w-[4.75rem] shrink-0 text-xs leading-4 tabular-nums">
        <span className="block font-medium">{formatTime(item.startAt!, locale, timezone)}</span>
        {item.endAt && (
          <span className="block text-muted-foreground">
            {until ? "…" : formatTime(item.endAt, locale, timezone)}
          </span>
        )}
      </span>
      <span className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: item.color }} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-muted-foreground">
            <SourceIcon kind={item.kind} />
          </span>
          <span className="truncate text-sm font-semibold">{item.title}</span>
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
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>
      {until && (
        <span className="shrink-0 text-muted-foreground">
          {t("untilDate", { date: formatShortDate(until, locale) })}
        </span>
      )}
      <CalendarItemPeople item={item} compact />
    </button>
  );
}
