import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Building2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import type { NetworkOrganizationListItem } from "../organization-queries";
import { networkCardClass, networkListClass, networkRowClass } from "./network-card";

/** Organisations we know people at, or could be introduced to. */
export async function OrganizationList({ organizations }: { organizations: NetworkOrganizationListItem[] }) {
  const t = await getTranslations("network");
  if (!organizations.length) {
    return <div className={networkCardClass}><EmptyState icon={<Building2 />} title={t("organizations.empty")} /></div>;
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("organizations.intro")}</p>
      <ul className={cn(networkCardClass, networkListClass)} data-testid="network-organization-list">
        {organizations.map((organization) => (
          <li key={organization.id}>
            <Link href={`/network/organizations/${organization.id}`} className={cn(networkRowClass, "flex items-center gap-3 outline-none transition-colors hover:bg-accent focus-visible:bg-accent")}>
              <Building2 className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-medium">{organization.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {[
                  organization.people ? t("organizations.people", { count: organization.people }) : null,
                  organization.intros ? t("organizations.intros", { count: organization.intros }) : null,
                ].filter(Boolean).join(" · ")}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
