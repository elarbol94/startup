"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import type { MunicipalityBounds } from "@/modules/municipalities/data";
import { defaultContactListFilter, isContactListFiltered } from "../contact-filters";
import {
  NETWORK_MAP_PATH,
  networkMapConnections,
  networkMapHref,
  personLocations,
  summarizeNetworkMap,
  type NetworkMapParams,
} from "../network-map";
import type { NetworkMapPayload } from "../network-map-queries";
import { ContactFilters } from "./contact-list/contact-filters";
import { NetworkMapPanel } from "./network-map/network-map-panel";
import { buildNetworkMapLayers, connectionLines, networkBounds, topMunicipalities } from "./network-map/network-map-utils";
import { useMunicipalityIndex } from "./network-map/use-municipality-index";

const NetworkMapCanvas = dynamic(
  () => import("./network-map/network-map-canvas").then((module) => module.NetworkMapCanvas),
  { ssr: false, loading: () => <Skeleton className="h-full w-full rounded-2xl" /> },
);

/**
 * The network on the municipality map: filters like the list, colour by a
 * chosen measure, select a municipality to see who is there and where
 * connections lead. Colour and selection change the URL in place (no server
 * round trip); filters navigate, so the server applies the access rules.
 */
export function NetworkMapView({ data, params, today }: { data: NetworkMapPayload; params: NetworkMapParams; today: string }) {
  const t = useTranslations("network");
  const locale = useLocale();
  const [mode, setMode] = useState(params.color);
  const [selectedCode, setSelectedCode] = useState(params.municipalityCode);
  const { index, failed, byCode } = useMunicipalityIndex();
  const current: NetworkMapParams = { filter: data.filter, color: mode, municipalityCode: selectedCode };

  function update(patch: Partial<NetworkMapParams>) {
    const next = { ...current, ...patch };
    setMode(next.color);
    setSelectedCode(next.municipalityCode);
    window.history.replaceState(null, "", networkMapHref(next));
  }

  const summary = useMemo(() => summarizeNetworkMap(data, today), [data, today]);
  const summaryByCode = useMemo(() => new Map(summary.map((municipality) => [municipality.code, municipality])), [summary]);
  const layers = useMemo(() => buildNetworkMapLayers(summary, mode, today, byCode), [byCode, mode, summary, today]);
  const people = useMemo(() => new Map(data.people.map((person) => [person.id, person])), [data.people]);
  const organizations = useMemo(() => new Map(data.organizations.map((organization) => [organization.id, organization])), [data.organizations]);
  const connections = useMemo(() => (selectedCode ? networkMapConnections(selectedCode, data) : []), [data, selectedCode]);
  const lines = useMemo(() => connectionLines(selectedCode, connections, byCode), [byCode, connections, selectedCode]);
  const highlightCodes = useMemo(() => (connections.length ? connections.map((connection) => connection.code) : null), [connections]);
  const bounds = useMemo(() => networkBounds(summary, byCode), [byCode, summary]);
  // A fresh array makes the map fly there; the "Netzwerk" button sets one on demand.
  const [focus, setFocus] = useState<{ for: MunicipalityBounds | null; bounds: MunicipalityBounds | null }>({ for: null, bounds: null });
  if (focus.for !== bounds) setFocus({ for: bounds, bounds: selectedCode ? null : bounds });

  const organizationCodes = useMemo(() => new Map(data.organizations.map((organization) => [organization.id, organization.municipalityCode])), [data.organizations]);
  const unlocated = data.people.filter((person) => personLocations(person, organizationCodes).length === 0).length;
  const numbers = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const topCodes = topMunicipalities(summary, layers.values);
  const valueLabel = (code: string) => {
    const value = layers.values[code];
    if (value == null) return "—";
    return mode === "recency" ? t("map.legendDays", { days: value }) : numbers.format(value);
  };

  return (
    <div className="space-y-3">
      <ContactFilters
        filter={data.filter}
        organizations={data.organizationFacets}
        municipalities={[]}
        tags={data.tags}
        hide={["municipality", "sort"]}
        basePath={NETWORK_MAP_PATH}
        hrefFor={(filter) => networkMapHref({ ...current, filter })}
        clearHref={isContactListFiltered(data.filter) ? networkMapHref({ ...current, filter: defaultContactListFilter }) : null}
      />
      <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]" aria-label={t("map.regionLabel")}>
        <div className="h-[min(70dvh,40rem)] min-h-[22rem]">
          {failed ? (
            <p className="grid h-full place-items-center rounded-2xl border text-sm text-muted-foreground">{t("map.loadFailed")}</p>
          ) : index ? (
            <NetworkMapCanvas
              austriaBounds={index.bounds}
              summaryByCode={summaryByCode}
              mode={mode}
              onModeChange={(color) => update({ color })}
              today={today}
              selectedCode={selectedCode}
              onSelect={(code) => update({ municipalityCode: code })}
              values={layers.values}
              domain={layers.domain}
              markers={layers.markers}
              lines={lines}
              highlightCodes={highlightCodes}
              focusBounds={focus.bounds}
              onFitNetwork={bounds ? () => setFocus({ for: bounds, bounds: [...bounds] }) : null}
            />
          ) : (
            <Skeleton className="h-full w-full rounded-2xl" aria-label={t("map.loading")} />
          )}
        </div>
        <NetworkMapPanel
          filter={data.filter}
          mode={mode}
          today={today}
          byCode={byCode}
          summary={summary}
          selected={summaryByCode.get(selectedCode) ?? null}
          selectedCode={selectedCode}
          connections={connections}
          people={people}
          organizations={organizations}
          topCodes={topCodes}
          valueLabel={valueLabel}
          unlocated={unlocated}
          totalOnMap={data.people.length - unlocated}
          onSelect={(code) => update({ municipalityCode: code })}
        />
      </section>
    </div>
  );
}
