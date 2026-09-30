"use client";

import { useId, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { rankSuggestions, type Suggestion } from "../network-utils";
import { SuggestionList, type SuggestionRow } from "./suggestion-list";

/**
 * Free text with the values used before: focusing lists them (most recent
 * first), typing narrows them ignoring case and accents, and a close match
 * is offered for typos. Anything new is simply kept and suggested next time.
 */
export function SuggestInput({
  id,
  value,
  onChange,
  suggestions,
  placeholder,
  maxLength,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: Suggestion[];
  placeholder?: string;
  maxLength?: number;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const { rows, exact } = useMemo(() => {
    const ranked = rankSuggestions(suggestions, value);
    // The value already typed in full is not worth suggesting again.
    const matches = ranked.exact && ranked.exact.value === value.trim()
      ? ranked.matches.filter((suggestion) => suggestion !== ranked.exact)
      : ranked.matches;
    const next: SuggestionRow[] = [
      ...matches.map((suggestion) => ({ kind: "match" as const, value: suggestion.value, count: suggestion.count })),
      ...ranked.closest.map((suggestion) => ({ kind: "closest" as const, value: suggestion.value, count: suggestion.count })),
    ];
    return { rows: next, exact: ranked.exact };
  }, [suggestions, value]);

  function pick(row: SuggestionRow) {
    onChange(row.value);
    setOpen(false);
    setActive(-1);
  }

  return (
    <div className="relative">
      <Input
        id={id}
        role="combobox"
        aria-expanded={open && rows.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        maxLength={maxLength}
        placeholder={placeholder}
        value={value}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Same text in other case or accents: keep the spelling already used.
          if (exact && exact.value !== value.trim()) onChange(exact.value);
          setOpen(false);
        }}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActive((index) => (rows.length ? (index + 1) % rows.length : -1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => (rows.length ? (index - 1 + rows.length) % rows.length : -1));
          } else if (event.key === "Enter" && open && active >= 0 && rows[active]) {
            event.preventDefault();
            pick(rows[active]);
          } else if (event.key === "Escape" && open) {
            event.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {open && <SuggestionList id={listId} rows={rows} active={active} query={value} onHover={setActive} onPick={pick} />}
    </div>
  );
}
