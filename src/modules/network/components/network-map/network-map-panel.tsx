"use client";

// Beside the network map: an overview while nothing is selected, otherwise who is in the selected
// municipality, which organisations are there and where connections lead. Everything comes from the
// payload already on the page, so selecting needs no round trip.
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowUpRight, Building2, Home, Lock, Network, X } from "lucide-react";
import type { MunicipalityIndexItem } from "@/modules/municipalities/data";
import { isContactListFiltered, networkFilterHref, type ContactListFilter } from "../../contact-filters";
import type {
  NetworkMapColorMode,
  NetworkMapConnection,
  NetworkMapMunicipality,
  NetworkMapOrganization,
  NetworkMapPerson,
} from "../../network-map";
import { municipalityHref } from "../municipality-link";

type Props = {
  filter: ContactListFilter;
  mode: NetworkMapColorMode;
  today: string;
  byCode: Map<string, MunicipalityIndexItem>;
  summary: NetworkMapMunicipality[];
  selected: NetworkMapMunicipality | null;
  selectedCode: string;
  connections: NetworkMapConnection[];
  people: Map<string, NetworkMapPerson>;
  organizations: Map<string, NetworkMapOrganization>;
  topCodes: string[];
  valueLabel: (code: string) => string;
  unlocated: number;
  totalOnMap: number;
  onSelect: (code: string) => void;
};

const panelClass = "rounded-2xl border bg-card p-4 text-sm lg:max-h-[min(70dvh,40rem)] lg:overflow-y-auto";

export function NetworkMapPanel(props: Props) {
  return props.selectedCode ? <SelectedPanel {...props} /> : <OverviewPanel {...props} />;
}

function OverviewPanel({ filter, mode, byCode, summary, topCodes, valueLabel, unlocated, totalOnMap, onSelect }: Props) {
  const t = useTranslations("network");
  const municipalities = summary.filter((municipality) => municipality.personIds.length > 0).length;
  return (
    <aside className={panelClass} data-testid="network-map-panel" aria-label={t("map.summary.title")}>
      <h2 className="mb-2 flex items-center gap-2 font-semibold"><Network className="size-4 text-muted-foreground" />{t("map.summary.title")}</h2>
      {summary.length === 0 ? (
        <p className="text-muted-foreground">{t(isContactListFiltered(filter) ? "map.summary.emptyFiltered" : "map.summary.empty")}</p>
      ) : (
        <>
          <p>{t("map.summary.stats", { people: totalOnMap, municipalities })}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("map.summary.hint")}</p>
        </>
      )}
      {unlocated > 0 && (
        <Link href={networkFilterHref(filter)} className="mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground">
          {t("map.summary.unlocated", { count: unlocated })}
        </Link>
      )}
      {topCodes.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 text-xs text-muted-foreground">{t("map.summary.top", { mode: t(`map.colorModes.${mode}`) })}</p>
          <ul className="space-y-0.5">
            {topCodes.map((code) => (
              <li key={code}>
                <button type="button" className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left hover:bg-accent" onClick={() => onSelect(code)}>
                  <span className="truncate">{byCode.get(code)?.name ?? code}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{valueLabel(code)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}

function SelectedPanel({ filter, today, byCode, selected, selectedCode, connections, people, organizations, onSelect }: Props) {
  const t = useTranslations("network");
  const name = byCode.get(selectedCode)?.name ?? selectedCode;
  const residents = (selected?.residentIds ?? []).flatMap((id) => people.get(id) ?? []);
  const located = (selected?.organizationIds ?? []).flatMap((id) => organizations.get(id) ?? []);
  const atOrganization = (organizationId: string) =>
    (selected?.personIds ?? []).flatMap((id) => people.get(id) ?? []).filter((person) => person.organizationId === organizationId);
  const empty = !residents.length && !located.length;

  return (
    <aside className={panelClass} data-testid="network-map-panel" aria-label={name}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{name}</h2>
          <Link href={municipalityHref(selectedCode)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            {t("map.panel.openMunicipality")}<ArrowUpRight className="size-3" />
          </Link>
        </div>
        <button type="button" className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-accent" aria-label={t("map.panel.clear")} onClick={() => onSelect("")}>
          <X className="size-4" />
        </button>
      </div>
      {empty ? <p className="text-muted-foreground">{t("map.panel.empty")}</p> : (
        <div className="space-y-3">
          {residents.length > 0 && (
            <div>
              <p className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Home className="size-3.5" />{t("map.panel.residents")}</p>
              <PeopleList people={residents} today={today} showOrganization />
              <Link href={networkFilterHref(filter, { municipalityCode: selectedCode })} className="mt-1 inline-block text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">
                {t("map.panel.showInList")}
              </Link>
            </div>
          )}
          {located.length > 0 && (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Building2 className="size-3.5" />{t("map.panel.organizations")}</p>
              {located.map((organization) => {
                const staff = atOrganization(organization.id);
                return (
                  <div key={organization.id}>
                    <Link href={`/network/organizations/${organization.id}`} className="font-medium hover:underline">{organization.name}</Link>
                    {staff.length ? <PeopleList people={staff} today={today} /> : <p className="text-xs text-muted-foreground">{t("organizations.noPeople")}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {connections.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <p className="text-xs font-semibold">{t("map.panel.connections")}</p>
          <p className="mb-1 text-xs text-muted-foreground">{t("map.panel.connectionsHint")}</p>
          <ul className="space-y-0.5">
            {connections.map((connection) => (
              <li key={connection.code}>
                <button type="button" className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left hover:bg-accent" onClick={() => onSelect(connection.code)}>
                  <span className="truncate">{byCode.get(connection.code)?.name ?? connection.code}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {[
                      connection.people ? t("map.panel.connectionPeople", { count: connection.people }) : "",
                      connection.introductions ? t("map.panel.connectionIntroductions", { count: connection.introductions }) : "",
                    ].filter(Boolean).join(" · ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}

function PeopleList({ people, today, showOrganization }: { people: NetworkMapPerson[]; today: string; showOrganization?: boolean }) {
  const t = useTranslations("network");
  return (
    <ul className="space-y-0.5">
      {people.map((person) => {
        const detail = [person.role, showOrganization ? person.organization : ""].filter(Boolean).join(", ");
        const due = person.reconnectDueOn !== null && person.reconnectDueOn <= today;
        return (
          <li key={person.id} className="flex items-center gap-2">
            <Link href={`/network/${person.id}`} className="min-w-0 flex-1 truncate hover:underline">
              <span className="font-medium">{person.name}</span>
              {person.visibility === "private" && <Lock className="ml-1 inline size-3 text-muted-foreground" aria-label={t("visibility.private")} />}
              {detail && <span className="text-muted-foreground"> · {detail}</span>}
            </Link>
            {person.closeness && <span className="shrink-0 text-[11px] text-muted-foreground">{t(`closeness.${person.closeness}`)}</span>}
            {due && <span className="shrink-0 rounded-full bg-amber-100 px-1.5 text-[11px] text-amber-900 dark:bg-amber-950 dark:text-amber-200">{t("map.panel.reconnectDue")}</span>}
          </li>
        );
      })}
    </ul>
  );
}
