"use client";

// Search-and-pick input over the municipality index. Used by analysis-editor.tsx to set the graph's subject.
import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { loadMunicipalityIndex } from "../../analysis-data";
import { searchMunicipalities, type MunicipalityIndexItem } from "../../data";

/** Search-and-pick over the municipality index, used wherever one has to be chosen. */
export function MunicipalityPicker({
  label,
  placeholder,
  compact = false,
  onPick,
}: {
  label: string;
  placeholder: string;
  compact?: boolean;
  onPick: (municipality: MunicipalityIndexItem) => void;
}) {
  const [municipalities, setMunicipalities] = useState<MunicipalityIndexItem[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadMunicipalityIndex()
      .then((index) => { if (!cancelled) setMunicipalities(index.municipalities); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const results = useMemo(
    () => (query.trim() ? searchMunicipalities(municipalities, query).slice(0, 6) : []),
    [municipalities, query],
  );

  return (
    <div className="relative">
      <Input
        className={cn(compact && "h-8 text-xs")}
        value={query}
        maxLength={80}
        aria-label={label}
        placeholder={placeholder}
        onValueChange={(value) => setQuery(value)}
      />
      {results.length > 0 && (
        <div className="absolute top-full right-0 left-0 z-20 mt-1 grid gap-0.5 rounded-lg border bg-background p-1 shadow-lg">
          {results.map((item) => (
            <button
              key={item.municipalityCode}
              type="button"
              className={cn("truncate rounded-md px-2 py-1 text-left hover:bg-accent", compact ? "text-[11px]" : "text-sm")}
              onClick={() => { onPick(item); setQuery(""); }}
            >
              {item.name} · {item.municipalityCode}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
