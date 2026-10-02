"use client";

// Search box bound to filters.query; typing is debounced before the URL/filter update.
// Used by calendar-sidebar.tsx and calendar-filters-dialog.tsx.
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip";
import type { FilterState } from "../calendar-types";
import type { CalendarT } from "./sidebar-types";

const DEBOUNCE_MS = 200;

export function CalendarSearchInput({
  t,
  filters,
  updateFilters,
}: {
  t: CalendarT;
  filters: FilterState;
  updateFilters: (next: FilterState) => void;
}) {
  const [value, setValue] = useState(filters.query);
  const [syncedQuery, setSyncedQuery] = useState(filters.query);
  // Follow external changes (saved views, "show only", reset) without clobbering typing.
  if (syncedQuery !== filters.query) {
    setSyncedQuery(filters.query);
    setValue(filters.query);
  }
  const latest = useRef({ filters, updateFilters });
  useEffect(() => {
    latest.current = { filters, updateFilters };
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function change(next: string) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      const current = latest.current;
      if (current.filters.query !== next) current.updateFilters({ ...current.filters, query: next });
    }, DEBOUNCE_MS);
  }

  return (
    <div className="relative">
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <ShortcutTooltip label={t("shortcutSearch")} shortcut="/" hint={t("hintSearch")}>
        <Input
          type="search"
          data-calendar-search
          aria-label={t("searchPlaceholder")}
          placeholder={t("searchPlaceholder")}
          value={value}
          onChange={(event) => change(event.target.value)}
          className="pl-8"
        />
      </ShortcutTooltip>
    </div>
  );
}
