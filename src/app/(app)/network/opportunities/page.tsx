import { requireUser } from "@/lib/auth";
import { localDateInZone } from "@/modules/calendar/date-utils";
import { OpportunitiesView } from "@/modules/network/components/opportunities-view";
import { listNetworkOrganizationNames } from "@/modules/network/organization-queries";
import { listNetworkContactOptions, listNetworkLeads } from "@/modules/network/queries";
import { TIME_ZONE } from "@/modules/time/lib/entry-time";

export default async function NetworkOpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const viewer = await requireUser();
  const includeClosed = (await searchParams).show === "all";
  return (
    <OpportunitiesView
      leads={listNetworkLeads(viewer, { includeClosed })}
      contacts={listNetworkContactOptions(viewer)}
      organizationNames={listNetworkOrganizationNames(viewer)}
      includeClosed={includeClosed}
      today={localDateInZone(new Date(), TIME_ZONE)}
    />
  );
}
