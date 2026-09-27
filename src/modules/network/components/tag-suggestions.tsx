"use client";

import { useTranslations } from "next-intl";
import { normalizeText, parseTagInput } from "../network-utils";

/** Tappable known tags below a comma-separated tag input; hides tags already entered. */
export function TagSuggestions({
  value,
  suggestions,
  onChange,
}: {
  value: string;
  suggestions: string[];
  onChange: (value: string) => void;
}) {
  const t = useTranslations("network");
  const entered = new Set(parseTagInput(value).map(normalizeText));
  const available = suggestions.filter((tag) => !entered.has(normalizeText(tag))).slice(0, 12);
  if (!available.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("tags.suggestions")}>
      {available.map((tag) => (
        <button
          key={tag}
          type="button"
          className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={() => onChange(parseTagInput([...parseTagInput(value), tag]).join(", "))}
        >
          + {tag}
        </button>
      ))}
    </div>
  );
}
