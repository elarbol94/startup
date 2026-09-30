"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseTagInput, rankSuggestions, type Suggestion } from "../network-utils";
import { SuggestionList, type SuggestionRow } from "./suggestion-list";

/**
 * Tags as chips. Focusing shows every known tag (most used first); typing
 * filters them ignoring case and accents, offers close matches for typos,
 * and adds a new tag only when nothing fits. Enter, comma or Tab adds; a
 * matching tag keeps its stored spelling; Backspace removes the last chip.
 */
export function TagInput({
  id,
  value,
  onChange,
  suggestions,
  autoFocus,
  onSubmit,
}: {
  id?: string;
  value: string[];
  onChange: (value: string[]) => void;
  suggestions: Suggestion[];
  autoFocus?: boolean;
  /** Enter on an empty field, e.g. to save an inline editor. */
  onSubmit?: () => void;
}) {
  const t = useTranslations("network");
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const { rows, exact } = useMemo(() => {
    const ranked = rankSuggestions(suggestions, text, { exclude: value });
    const next: SuggestionRow[] = [
      ...ranked.matches.map((suggestion) => ({ kind: "match" as const, value: suggestion.value, count: suggestion.count })),
      ...ranked.closest.map((suggestion) => ({ kind: "closest" as const, value: suggestion.value, count: suggestion.count })),
    ];
    const typed = text.trim();
    if (typed && !ranked.exact && !parseTagInput(value).some((tag) => tag.toLocaleLowerCase("de") === typed.toLocaleLowerCase("de"))) {
      next.push({ kind: "create", value: typed });
    }
    return { rows: next, exact: ranked.exact };
  }, [suggestions, text, value]);

  function add(names: string[]) {
    onChange(parseTagInput([...value, ...names]));
    setText("");
    setActive(-1);
  }

  /** Adds what was typed, using the stored spelling when it names a known tag. */
  function commitText() {
    const typed = text.trim().replace(/[,;]+$/, "").trim();
    if (!typed) return false;
    add([exact?.value ?? typed]);
    return true;
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((index) => (rows.length ? (index + 1) % rows.length : -1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (rows.length ? (index - 1 + rows.length) % rows.length : -1));
    } else if (event.key === "Enter") {
      if (open && active >= 0 && rows[active]) {
        event.preventDefault();
        add([rows[active].value]);
      } else if (text.trim()) {
        event.preventDefault();
        commitText();
      } else if (onSubmit) {
        event.preventDefault();
        onSubmit();
      }
      // Otherwise Enter on an empty field submits the surrounding form as usual.
    } else if (event.key === "," || event.key === ";") {
      event.preventDefault();
      commitText();
    } else if (event.key === "Tab" && text.trim()) {
      commitText();
    } else if (event.key === "Backspace" && !text && value.length) {
      onChange(value.slice(0, -1));
    } else if (event.key === "Escape" && open) {
      event.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <div
        className="flex min-h-8 w-full flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent px-1.5 py-1 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            event.preventDefault();
            inputRef.current?.focus();
          }
        }}
      >
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-0.5 rounded-full bg-secondary py-0.5 pr-0.5 pl-2 text-xs font-medium text-secondary-foreground">
            {tag}
            <button
              type="button"
              className="grid size-4 place-items-center rounded-full hover:bg-foreground/10"
              aria-label={t("tags.remove", { tag })}
              onClick={() => onChange(value.filter((entry) => entry !== tag))}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={open && rows.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          className="h-6 min-w-24 flex-1 bg-transparent px-1 text-base outline-none placeholder:text-muted-foreground md:text-sm"
          placeholder={value.length ? t("tags.addMore") : t("tags.placeholder")}
          value={text}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            commitText();
            setOpen(false);
          }}
          onChange={(event) => {
            const next = event.target.value;
            // Pasting "Design, Förderung" adds both.
            if (/[,;\n]/.test(next) && next.replace(/[,;\n]+$/, "").match(/[,;\n]/)) {
              add(next.split(/[,;\n]/));
              return;
            }
            setText(next);
            setOpen(true);
            setActive(next.trim() ? 0 : -1);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      {open && (
        <SuggestionList
          id={listId}
          rows={rows}
          active={active}
          query={text}
          onHover={setActive}
          onPick={(row) => add([row.value])}
        />
      )}
    </div>
  );
}

/** Tappable most-used tags below the input, for quick picks on a phone. */
export function PopularTags({
  value,
  suggestions,
  onChange,
  limit = 8,
}: {
  value: string[];
  suggestions: Suggestion[];
  onChange: (value: string[]) => void;
  limit?: number;
}) {
  const t = useTranslations("network");
  const available = rankSuggestions(suggestions, "", { exclude: value }).matches.slice(0, limit);
  if (!available.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("tags.suggestions")}>
      {available.map((tag) => (
        <button
          key={tag.value}
          type="button"
          className={cn("rounded-full border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground")}
          onClick={() => onChange(parseTagInput([...value, tag.value]))}
        >
          + {tag.value}
        </button>
      ))}
    </div>
  );
}
