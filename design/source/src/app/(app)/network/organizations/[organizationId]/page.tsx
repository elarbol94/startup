import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { localDateInZone } from "@/modules/calendar/date-utils";
import { OrganizationDetail } from "@/modules/network/components/organization-detail";
import { listOrganizationMergeCandidates } from "@/modules/network/organization-merge";
import { getNetworkOrganization, listNetworkOrganizationNames } from "@/modules/network/organization-queries";
import { listNetworkContactOptions } from "@/modules/network/queries";
import { TIME_ZONE } from "@/modules/time/lib/entry-time";

export default async function NetworkOrganizationPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const viewer = await requireUser();
  const { organizationId } = await params;
  const organization = getNetworkOrganization(viewer, organizationId);
  if (!organization) notFound();
  return (
    <OrganizationDetail
      organization={organization}
      contacts={listNetworkContactOptions(viewer)}
      organizationNames={listNetworkOrganizationNames(viewer)}
      today={localDateInZone(new Date(), TIME_ZONE)}
      mergeCandidates={viewer.role === "admin" ? listOrganizationMergeCandidates(viewer, organization.id) : null}
    />
  );
}
