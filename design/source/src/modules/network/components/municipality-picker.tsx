"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { searchNetworkMunicipalities } from "../municipality-actions";

export type MunicipalityValue = { code: string; name: string } | null;
type Option = { code: string; name: string; state: string };

/** Search-as-you-type over the map section's municipalities; stores the Gemeindekennziffer. */
export function MunicipalityPicker({
  id,
  value,
  onChange,
  disabled,
}: {
  id?: string;
  value: MunicipalityValue;
  onChange: (value: MunicipalityValue) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("network");
  const listId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ query: string; options: Option[] }>({ query: "", options: [] });
  const [active, setActive] = useState(0);
  const options = query.trim() && results.query === query ? results.options : [];

  useEffect(() => {
    if (!query.trim()) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void searchNetworkMunicipalities(query)
        .then((found) => { if (!cancelled) { setResults({ query, options: found }); setActive(0); } })
        .catch(() => { if (!cancelled) setResults({ query, options: [] }); });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  function choose(option: Option) {
    onChange({ code: option.code, name: option.name });
    setQuery("");
  }

  if (value) {
    return (
      <div className="flex h-8 items-center gap-2 rounded-lg border px-2.5 text-sm">
        <MapPin className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate" data-testid="municipality-picker-value">{value.name}</span>
        <Button type="button" size="icon-xs" variant="ghost" disabled={disabled} aria-label={t("municipality.clear", { name: value.name })} onClick={() => onChange(null)}>
          <X />
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        id={id}
        role="combobox"
        aria-expanded={options.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        placeholder={t("municipality.placeholder")}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (!options.length) return;
          if (event.key === "ArrowDown") { event.preventDefault(); setActive((index) => (index + 1) % options.length); }
          if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => (index - 1 + options.length) % options.length); }
          if (event.key === "Enter") { event.preventDefault(); choose(options[active]); }
          if (event.key === "Escape") { event.stopPropagation(); setQuery(""); }
        }}
      />
      {options.length > 0 && (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-9 z-50 max-h-64 overflow-y-auto rounded-lg border bg-popover p-1 shadow-md">
          {options.map((option, index) => (
            <li
              key={option.code}
              role="option"
              aria-selected={index === active}
              className={cn("flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm", index === active && "bg-muted")}
              onMouseEnter={() => setActive(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(option);
              }}
            >
              <span className="truncate">{option.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{option.state}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
