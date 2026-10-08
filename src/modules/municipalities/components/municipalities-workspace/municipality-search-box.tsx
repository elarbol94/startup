"use client";

// Municipality search combobox overlaid on the workspace map (typing, keyboard navigation, result list).
// Used by municipalities-workspace.tsx. "/" focuses it, like every section's search field.
import { useRef, type Dispatch, type SetStateAction } from "react";
import { useTranslations } from "next-intl";
import { Search, X } from "lucide-react";
import { ShortcutKeys } from "@/components/ui/shortcut-tooltip";
import { useKeyboardShortcut } from "@/components/use-keyboard-shortcut";
import { SECTION_PAGE_SHORTCUTS } from "@/lib/app-shortcuts";
import { ariaKeyShortcuts } from "@/lib/shortcuts";
import type { MunicipalityIndexItem } from "../../data";

export function MunicipalitySearchBox({
  query, setQuery, searchOpen, setSearchOpen, activeResult, setActiveResult, results,
  updateSelection,
}: {
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  searchOpen: boolean;
  setSearchOpen: Dispatch<SetStateAction<boolean>>;
  activeResult: number;
  setActiveResult: Dispatch<SetStateAction<number>>;
  results: MunicipalityIndexItem[];
  updateSelection: (item: MunicipalityIndexItem | null) => void;
}) {
  const t = useTranslations("municipalities");
  const inputRef = useRef<HTMLInputElement>(null);
  useKeyboardShortcut(SECTION_PAGE_SHORTCUTS.municipalities.search, () => {
    inputRef.current?.focus();
    inputRef.current?.select();
  });
  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!results.length) {
      if (event.key === "Escape") setSearchOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSearchOpen(true);
      setActiveResult((value) => (value + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSearchOpen(true);
      setActiveResult((value) => (value - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      updateSelection(results[activeResult] ?? results[0]);
    } else if (event.key === "Escape") setSearchOpen(false);
  }

  return (
    <div className="absolute top-3 left-3 z-20 w-[min(24rem,calc(100%-5.5rem))]">
      <div className="relative rounded-xl border bg-background/95 shadow-lg backdrop-blur">
        <Search className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSearchOpen(true);
            setActiveResult(0);
          }}
          onFocus={() => setSearchOpen(true)}
          onKeyDown={handleSearchKeyDown}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchLabel")}
          aria-keyshortcuts={ariaKeyShortcuts(SECTION_PAGE_SHORTCUTS.municipalities.search)}
          aria-controls="municipality-search-results"
          aria-expanded={searchOpen && results.length > 0}
          role="combobox"
          className="h-10 w-full rounded-xl bg-transparent pr-10 pl-9 text-sm outline-none focus:ring-2 focus:ring-teal-600/40"
        />
        {!query && <ShortcutKeys shortcut={SECTION_PAGE_SHORTCUTS.municipalities.search} className="pointer-events-none absolute top-2.5 right-3 hidden sm:inline-flex" />}
        {query && (
          <button
            type="button"
            aria-label={t("clearSearch")}
            className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-md hover:bg-accent"
            onClick={() => {
              setQuery("");
              setSearchOpen(false);
            }}
          >
            <X className="size-4" />
          </button>
        )}
        {searchOpen && query && (
          <div
            id="municipality-search-results"
            role="listbox"
            // Opens beside the search box from sm up: dropping straight down covered
            // the Kennzahl/Ansicht/Jahr panel, hiding the settings being compared.
            className="absolute top-[calc(100%+0.4rem)] left-0 max-h-72 w-full overflow-y-auto rounded-xl border bg-popover p-1 shadow-xl sm:top-0 sm:left-[calc(100%+0.5rem)]"
          >
            {results.length ? (
              results.map((item, position) => (
                <button
                  key={item.municipalityCode}
                  type="button"
                  role="option"
                  aria-selected={position === activeResult}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm ${position === activeResult ? "bg-accent" : "hover:bg-accent"}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveResult(position)}
                  onClick={() => updateSelection(item)}
                >
                  <span>
                    <span className="block font-medium">{item.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {item.state}
                    </span>
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {item.municipalityCode}
                  </span>
                </button>
              ))
            ) : (
              <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                {t("noSearchResults")}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
