"use client";

// The Ausgangsdaten/Kennzahlen catalog, in the editor's sidebar and on the analysis landing page.
// Used by studio-palette.tsx and analysis-landing.tsx.
import { useCallback, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Database, Search, Sigma } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { MunicipalityDatasetRef } from "../../analysis";
import { normalizeMunicipalitySearch } from "../../data";
import type { MapMetric } from "../../demography";
import {
  AUSGANGSDATEN_CATALOG,
  bindKennzahlInput,
  kennzahlExpressionFor,
  kennzahlFormulaText,
  KENNZAHL_CATALOG,
  type KennzahlExpression,
} from "../../kennzahlen";
import type { MunicipalityMetricRecord } from "../../queries";
import { DATASET_DRAG_TYPE } from "./analysis-editor-constants";
import { datasetTitle } from "./analysis-labels";

type CatalogVariant = "sidebar" | "page";

/** One line of either catalog: what it is called, and what it is made of. */
type CatalogEntry = {
  id: string;
  category: MapMetric;
  label: string;
  /** The derivation, or null for an Ausgangsdatum, which is read straight from a file. */
  formula: string | null;
  dataset: MunicipalityDatasetRef;
  /** False for a Kennzahl the app computes directly: it is listed, but cannot be opened. */
  derivable: boolean;
};

function CatalogRow({
  entry,
  variant,
  openLabel,
  onOpen,
}: {
  entry: CatalogEntry;
  variant: CatalogVariant;
  openLabel: string;
  onOpen: () => void;
}) {
  const page = variant === "page";
  return (
    <button
      type="button"
      aria-label={`${entry.label} — ${openLabel}`}
      className={cn(
        "rounded-lg border bg-background text-left hover:border-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950",
        page ? "px-3 py-2" : "px-2 py-1.5",
      )}
      draggable={!page}
      onDragStart={event => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData(DATASET_DRAG_TYPE, JSON.stringify({ label: entry.label, dataset: entry.dataset })); }}
      onClick={onOpen}
    >
      <span className="flex items-center gap-1.5">
        {entry.formula === null
          ? <Database className={cn("shrink-0 text-teal-700 dark:text-teal-300", page ? "size-4" : "size-3")} />
          : <Sigma className={cn("shrink-0 text-teal-700 dark:text-teal-300", page ? "size-4" : "size-3")} />}
        <span className={cn("font-medium", page ? "text-sm" : "text-[11px]")}>{entry.label}</span>
      </span>
      {/* Never truncated: a formula cut off after three terms is not a derivation. */}
      {entry.formula !== null && (
        <span className={cn("mt-1 block break-words text-muted-foreground", page ? "text-xs leading-5" : "text-[10px] leading-4")}>
          {entry.formula}
        </span>
      )}
    </button>
  );
}

/**
 * Everything the analysis can read: the Ausgangsdaten straight out of the data files, and
 * the Kennzahlen with the formula they are built from. Clicking an entry puts it on the
 * canvas — an Ausgangsdatum as one node, a Kennzahl as its whole derivation in real nodes,
 * so the way it is calculated is something you can read and edit rather than take on trust.
 *
 * Neither list needs a municipality; only putting one on a canvas does.
 */
export function DatasetCatalog({
  variant,
  ownMetrics = [],
  onOpen,
}: {
  variant: CatalogVariant;
  ownMetrics?: MunicipalityMetricRecord[];
  onOpen: (request: { label: string; dataset: MunicipalityDatasetRef }) => void;
}) {
  const t = useTranslations("municipalities");
  const tf = useTranslations("municipalityFilters");
  const format = useFormatter();
  const page = variant === "page";
  const [query, setQuery] = useState("");

  const describe = useCallback((expression: KennzahlExpression) =>
    kennzahlFormulaText(expression, (input) => datasetTitle(input, t, tf), (value) => format.number(value)), [format, t, tf]);

  const sections = useMemo(() => {
    const group = (entries: CatalogEntry[]) => {
      const byCategory = new Map<MapMetric, CatalogEntry[]>();
      for (const entry of entries) byCategory.set(entry.category, [...(byCategory.get(entry.category) ?? []), entry]);
      return [...byCategory];
    };
    return {
      ausgangsdaten: group(AUSGANGSDATEN_CATALOG.map(({ id, category, output }) => ({
        id, category, label: datasetTitle(output, t, tf), formula: null,
        dataset: bindKennzahlInput(output), derivable: true,
      }))),
      kennzahlen: group(KENNZAHL_CATALOG.map(({ id, category, labelKey, output }) => {
        const expression = kennzahlExpressionFor(output);
        return {
          id, category,
          label: t(labelKey as "populationDensity"),
          formula: expression ? describe(expression) : null,
          dataset: bindKennzahlInput(output),
          derivable: expression !== null,
        };
      })),
    };
  }, [describe, t, tf]);

  const needle = normalizeMunicipalitySearch(query);
  const matches = (entry: CatalogEntry) => !needle
    || normalizeMunicipalitySearch(`${entry.label} ${entry.formula ?? ""}`).includes(needle);
  const filter = (groups: ReadonlyArray<readonly [MapMetric, CatalogEntry[]]>) => groups
    .map(([category, entries]) => [category, entries.filter(matches)] as const)
    .filter(([, entries]) => entries.length > 0);

  const categoryLabel = (category: MapMetric) => t(
    (category === "population" ? "metricPopulation"
      : category === "age" ? "metricAge"
        : category === "movement" ? "metricMovement"
          : category === "costs" ? "metricCosts"
            : category === "politics" ? "metricPolitics"
              : category === "digital" ? "metricDigital" : "metricCustom") as "metricPopulation",
  );

  const visibleAusgangsdaten = filter(sections.ausgangsdaten);
  const visibleKennzahlen = filter(sections.kennzahlen);
  const visibleOwn = ownMetrics.filter(({ name, expression }) =>
    !needle || normalizeMunicipalitySearch(`${name} ${describe(expression)}`).includes(needle));
  const empty = !visibleAusgangsdaten.length && !visibleKennzahlen.length && !visibleOwn.length;

  const renderGroups = (groups: ReturnType<typeof filter>) => groups.map(([category, entries]) => (
    <details key={`${category}:${Boolean(needle)}`} open={needle ? true : undefined} className="rounded-lg border p-2.5">
      <summary className="cursor-pointer text-sm font-medium">
        {categoryLabel(category)} <span className="ml-1 text-xs text-muted-foreground">({entries.length})</span>
      </summary>
      <div className={cn("mt-1.5 grid gap-1.5", page && "sm:grid-cols-2 xl:grid-cols-3")}>
        {entries.map((entry) => (
            <CatalogRow
              key={entry.id}
              entry={entry}
              variant={variant}
              openLabel={t("kennzahlOpenAsGraph")}
              // Open, not pinned: the derivation is the same everywhere, and which
              // municipality it is read for is the graph's business.
              onOpen={() => onOpen({ label: entry.label, dataset: entry.dataset })}
            />
          ))}
      </div>
    </details>
  ));

  return (
    <section className={cn(page ? "" : "mt-3 border-t pt-3")} data-testid="kennzahl-catalog">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={cn("font-semibold", page ? "text-xl" : "text-xs tracking-wide uppercase")}>
          {page ? t("catalogTitle") : t("catalog")}
        </h2>
        <span className={cn("text-muted-foreground", page ? "text-sm" : "text-[10px]")}>
          {page ? t("catalogDescription") : t("kennzahlCatalogHint")}
        </span>
      </div>

      <div className="relative mt-2">
        <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          className={cn("pl-7", page ? "max-w-sm" : "h-8 text-xs")}
          value={query}
          maxLength={80}
          aria-label={t("catalogSearch")}
          placeholder={t("catalogSearch")}
          onValueChange={(value) => setQuery(value)}
        />
      </div>

      <div className={cn("mt-3 grid", page ? "gap-5" : "gap-2.5")}>
        {empty && <p className={cn("text-muted-foreground", page ? "text-sm" : "text-[10px]")}>{t("catalogNoMatches")}</p>}

        {visibleAusgangsdaten.length > 0 && (
          <div className={page ? "grid gap-5" : "grid gap-2.5"}>
            <h3 className={cn("font-semibold", page ? "text-sm tracking-wide uppercase" : "text-[10px] tracking-wide uppercase")}>
              {t("dataKindBase")}
            </h3>
            {renderGroups(visibleAusgangsdaten)}
          </div>
        )}

        {visibleKennzahlen.length > 0 && (
          <div className={page ? "grid gap-5" : "grid gap-2.5"}>
            <h3 className={cn("font-semibold", page ? "text-sm tracking-wide uppercase" : "text-[10px] tracking-wide uppercase")}>
              {t("dataKindDerived")}
            </h3>
            {renderGroups(visibleKennzahlen)}
          </div>
        )}

        {visibleOwn.length > 0 && (
          <div>
            <h3 className={cn("font-semibold text-muted-foreground", page ? "text-xs tracking-wide uppercase" : "text-[10px] uppercase")}>
              {t("kennzahlOwnSection")}
            </h3>
            <div className={cn("mt-1.5 grid gap-1.5", page && "sm:grid-cols-2 xl:grid-cols-3")}>
              {visibleOwn.map((metric) => (
                <div key={metric.id} draggable={!page} onDragStart={event => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData(DATASET_DRAG_TYPE, JSON.stringify({ metricId: metric.id })); }} className={cn("rounded-lg border bg-background cursor-grab", page ? "px-3 py-2" : "px-2 py-1.5")}>
                  <p className={cn("font-medium", page ? "text-sm" : "text-[11px]")}>{metric.name}</p>
                  <p className={cn("mt-1 break-words text-muted-foreground", page ? "text-xs leading-5" : "text-[10px] leading-4")}>
                    {describe(metric.expression)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
