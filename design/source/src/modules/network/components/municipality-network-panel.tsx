"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Building2, Handshake, Home, Lock } from "lucide-react";
import { getMunicipalityNetwork } from "../municipality-actions";
import type { MunicipalityNetwork } from "../municipality-queries";

type Person = MunicipalityNetwork["residents"][number];

/**
 * Municipality section: who from the network lives in the selected
 * municipality and which organisations there we know people at. Only
 * contacts visible to the viewer are listed.
 */
export function MunicipalityNetworkPanel({ municipalityCode }: { municipalityCode: string }) {
  const t = useTranslations("network");
  const [state, setState] = useState<{ code: string; data: MunicipalityNetwork | null; failed: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMunicipalityNetwork(municipalityCode)
      .then((data) => { if (!cancelled) setState({ code: municipalityCode, data, failed: false }); })
      .catch(() => { if (!cancelled) setState({ code: municipalityCode, data: null, failed: true }); });
    return () => { cancelled = true; };
  }, [municipalityCode]);

  const current = state?.code === municipalityCode ? state : null;
  const data = current?.data;
  const empty = data && !data.residents.length && !data.organizations.length;

  return (
    <section className="rounded-2xl border bg-card p-4" data-testid="municipality-network-panel" aria-label={t("municipality.panelTitle")}>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Handshake className="size-4 text-muted-foreground" />
        {t("municipality.panelTitle")}
      </h3>
      {!current ? (
        <p className="text-sm text-muted-foreground" role="status">{t("municipality.loading")}</p>
      ) : current.failed ? (
        <p className="text-sm text-muted-foreground">{t("municipality.failed")}</p>
      ) : empty ? (
        <p className="text-sm text-muted-foreground">{t("municipality.empty")}</p>
      ) : (
        <div className="space-y-3 text-sm">
          {data!.residents.length > 0 && (
            <div>
              <p className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Home className="size-3.5" />{t("municipality.residents")}</p>
              <PeopleList people={data!.residents} showOrganization />
            </div>
          )}
          {data!.organizations.map((organization) => (
            <div key={organization.id}>
              <Link href={`/network/organizations/${organization.id}`} className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                <Building2 className="size-3.5" />
                {organization.name}
              </Link>
              {organization.people.length ? <PeopleList people={organization.people} /> : (
                <p className="text-xs text-muted-foreground">{t("organizations.noPeople")}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PeopleList({ people, showOrganization }: { people: Person[]; showOrganization?: boolean }) {
  const t = useTranslations("network");
  return (
    <ul className="space-y-0.5">
      {people.map((person) => (
        <li key={person.id}>
          <Link href={`/network/${person.id}`} className="block truncate hover:underline">
            <span className="font-medium">{person.name}</span>
            {person.visibility === "private" && <Lock className="ml-1 inline size-3 text-muted-foreground" aria-label={t("visibility.private")} />}
            {(person.role || (showOrganization && person.organization)) && (
              <span className="text-muted-foreground"> · {[person.role, showOrganization ? person.organization : ""].filter(Boolean).join(", ")}</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
