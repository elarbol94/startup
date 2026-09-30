"use client";

import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export type SuggestionRow = { kind: "match" | "closest" | "create"; value: string; count?: number };

/** Marks the typed text inside a suggestion (case-insensitive). */
function Highlighted({ value, query }: { value: string; query: string }) {
  const needle = query.trim().toLocaleLowerCase("de");
  const index = needle ? value.toLocaleLowerCase("de").indexOf(needle) : -1;
  if (index < 0) return <>{value}</>;
  return (
    <>
      {value.slice(0, index)}
      <mark className="rounded-sm bg-amber-200/70 text-inherit dark:bg-amber-500/30">{value.slice(index, index + needle.length)}</mark>
      {value.slice(index + needle.length)}
    </>
  );
}

/** The dropdown of known values shared by the tag and "met at" inputs. */
export function SuggestionList({
  id,
  rows,
  active,
  query,
  onPick,
  onHover,
}: {
  id: string;
  rows: SuggestionRow[];
  active: number;
  query: string;
  onPick: (row: SuggestionRow) => void;
  onHover: (index: number) => void;
}) {
  const t = useTranslations("network");
  if (!rows.length) return null;
  const firstClosest = rows.findIndex((row) => row.kind === "closest");
  return (
    <ul
      id={id}
      role="listbox"
      className="absolute inset-x-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
    >
      {rows.map((row, index) => (
        <li key={`${row.kind}:${row.value}`} role="presentation">
          {index === firstClosest && (
            <p className="px-2 pt-1.5 pb-0.5 text-[11px] font-medium text-muted-foreground">{t("suggest.didYouMean")}</p>
          )}
          <div
            id={`${id}-${index}`}
            role="option"
            aria-selected={index === active}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm",
              index === active && "bg-muted",
              row.kind === "create" && "text-muted-foreground",
            )}
            onMouseEnter={() => onHover(index)}
            // Keep focus in the input so the pick does not count as leaving the field.
            onMouseDown={(event) => {
              event.preventDefault();
              onPick(row);
            }}
          >
            {row.kind === "create" ? (
              <>
                <Plus className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{t("suggest.create", { value: row.value })}</span>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate"><Highlighted value={row.value} query={row.kind === "match" ? query : ""} /></span>
                {row.count !== undefined && row.count > 1 && (
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{row.count}×</span>
                )}
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
