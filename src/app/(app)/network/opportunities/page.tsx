import { requireUser } from "@/lib/auth";
import { localDateInZone } from "@/modules/calendar/date-utils";
import { OpportunitiesView } from "@/modules/network/components/opportunities-view";
import { ReconnectList } from "@/modules/network/components/reconnect-list";
import { listNetworkOrganizationNames } from "@/modules/network/organization-queries";
import { listNetworkContactOptions, listNetworkLeads } from "@/modules/network/queries";
import { listReconnectDue } from "@/modules/network/reconnect-queries";
import { TIME_ZONE } from "@/modules/time/lib/entry-time";

export default async function NetworkOpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const viewer = await requireUser();
  const includeClosed = (await searchParams).show === "all";
  const today = localDateInZone(new Date(), TIME_ZONE);
  return (
    <div className="space-y-6">
      <ReconnectList contacts={listReconnectDue(viewer, { today }).contacts} today={today} />
      <OpportunitiesView
        leads={listNetworkLeads(viewer, { includeClosed })}
        contacts={listNetworkContactOptions(viewer)}
        organizationNames={listNetworkOrganizationNames(viewer)}
        includeClosed={includeClosed}
        today={today}
      />
    </div>
  );
}
