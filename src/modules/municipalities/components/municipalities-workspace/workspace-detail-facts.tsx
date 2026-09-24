"use client";

// The selected municipality's facts (Ausgangsdaten and derived Kennzahlen), shown in the desktop sidebar
// and the mobile details sheet. Used by municipalities-workspace.tsx.
import { useTranslations } from "next-intl";
import type { MunicipalityIndexItem } from "../../data";
import type {
  digitalPlatformCostEstimate,
  DigitalPlatformViewId,
  MunicipalityDigitalPlatformProfile,
} from "../../digital-platforms";
import type { MapMetric } from "../../demography";
import type { MunicipalityPopulationSeries } from "../../population";
import type { PopulationViewId } from "../../structure";
import type { WorkspaceFormatters } from "./use-workspace-formatters";
import type { WorkspaceLabels } from "./use-workspace-labels";
import type { MunicipalityProfile } from "./workspace-utils";

export function WorkspaceDetailFacts({
  selected, selectedProfile, selectedPopulation, metric, digitalView, populationView, metricLabel,
  selectedDigitalPlatforms, selectedDigitalCostEstimate, activeValue, previousValue,
  averageAnnualPopulationChange, chartFormatter, chartUnit, formatMetricChange, populationSeries,
  personsFormatter, ratioFormatter, signedShareFormatter, digitalProviderDescription,
  formatDigitalCostRange,
}: {
  selected: MunicipalityIndexItem;
  selectedProfile: MunicipalityProfile | null;
  selectedPopulation: number;
  metric: MapMetric;
  digitalView: DigitalPlatformViewId;
  populationView: PopulationViewId;
  metricLabel: string;
  selectedDigitalPlatforms: MunicipalityDigitalPlatformProfile | null;
  selectedDigitalCostEstimate: ReturnType<typeof digitalPlatformCostEstimate> | null;
  activeValue: number | null;
  previousValue: number | null;
  averageAnnualPopulationChange: number | null;
  chartFormatter: Intl.NumberFormat;
  chartUnit: string;
  formatMetricChange: (current: number | null, comparison: number | null) => string;
  populationSeries: MunicipalityPopulationSeries;
} & Pick<WorkspaceFormatters, "personsFormatter" | "ratioFormatter" | "signedShareFormatter">
  & Pick<WorkspaceLabels, "digitalProviderDescription" | "formatDigitalCostRange">) {
  const t = useTranslations("municipalities");
  /**
   * The selected municipality's facts, split the same way the map's Datenart dropdown
   * splits them: what the sources report, and what is computed from it. One definition
   * feeds both the desktop sidebar and the mobile sheet, which used to hold near-verbatim
   * copies of the same list.
   */
  const derivedValueRow = activeValue !== null && metric !== "politics"
    && !(metric === "digital" && digitalView === "providers")
    && !(metric === "population" && populationView === "count");
  const showsDigitalCosts = metric === "digital" && digitalView === "providers";
  const hasDerivedFacts = derivedValueRow || showsDigitalCosts
    || previousValue !== null || averageAnnualPopulationChange !== null;
  return (
    <div className="grid gap-4">
      <section>
        <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{t("dataKindBase")}</h3>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
          <dt className="text-muted-foreground">{t("municipalityCode")}</dt><dd className="font-mono font-medium">{selected.municipalityCode}</dd>
          <dt className="text-muted-foreground">{t("state")}</dt><dd className="font-medium">{selected.state}</dd>
          <dt className="text-muted-foreground">{t("district")}</dt><dd className="font-medium">{selectedProfile?.district ?? t("profileDataUnavailable")}</dd>
          <dt className="text-muted-foreground">{t("population")}</dt><dd className="font-semibold tabular-nums">{personsFormatter.format(selectedPopulation)}</dd>
          {metric === "population" && populationView === "density" ? <><dt className="text-muted-foreground">{t("municipalityArea")}</dt><dd className="font-medium tabular-nums">{ratioFormatter.format(selected.areaSquareKilometers)} {t("areaUnit")}</dd></> : null}
          {showsDigitalCosts ? <><dt className="text-muted-foreground">{metricLabel}</dt><dd className="font-semibold">{digitalProviderDescription(selectedDigitalPlatforms ?? undefined)}</dd></> : null}
          <dt className="text-muted-foreground">{t("officialWebsite")}</dt>
          <dd className="min-w-0 font-medium">
            {selectedProfile?.officialWebsite ? (
              <a className="break-all text-teal-700 underline underline-offset-2 hover:text-teal-800" href={selectedProfile.officialWebsite} target="_blank" rel="noreferrer">{t("openWebsite")}</a>
            ) : t("profileDataUnavailable")}
          </dd>
        </dl>
      </section>
      {hasDerivedFacts ? (
        <section>
          <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{t("dataKindDerived")}</h3>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
            {showsDigitalCosts ? <>
              <dt className="text-muted-foreground">{t("digitalCostAnnualLabel")}</dt><dd className="font-semibold tabular-nums" data-testid="digital-cost-annual">{selectedDigitalCostEstimate ? formatDigitalCostRange(selectedDigitalCostEstimate.annualEuros) : t("digitalCostUnavailable")}</dd>
              <dt className="text-muted-foreground">{t("digitalCostSetupLabel")}</dt><dd className="font-medium tabular-nums">{selectedDigitalCostEstimate ? formatDigitalCostRange(selectedDigitalCostEstimate.setupEuros) : t("digitalCostUnavailable")}</dd>
              {selectedDigitalCostEstimate ? <><dt className="text-muted-foreground">{t("digitalCostConfidenceLabel")}</dt><dd className="font-medium">{t(selectedDigitalCostEstimate.confidence === "medium" ? "digitalCostConfidenceMedium" : "digitalCostConfidenceLow")}</dd></> : null}
            </> : null}
            {derivedValueRow ? <><dt className="text-muted-foreground">{metricLabel}</dt><dd className="font-semibold tabular-nums">{chartFormatter.format(activeValue!)}{chartUnit ? ` ${chartUnit}` : ""}</dd></> : null}
            {previousValue !== null ? <><dt className="text-muted-foreground">{metric === "population" ? t("populationChangePreviousYear") : metric === "movement" ? t("movementChangePreviousYear") : metric === "age" ? t("ageChangePreviousYear") : t("costChangePreviousYear")}</dt><dd className="font-medium tabular-nums">{formatMetricChange(activeValue, previousValue)}</dd></> : null}
            {averageAnnualPopulationChange !== null ? <><dt className="text-muted-foreground">{t("populationAverageAnnualChange", { year: populationSeries.firstYear })}</dt><dd className="font-medium tabular-nums">{signedShareFormatter.format(averageAnnualPopulationChange)}</dd></> : null}
          </dl>
        </section>
      ) : null}
    </div>
  );
}
