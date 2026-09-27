import { requireUser } from "@/lib/auth";
import { OrganizationList } from "@/modules/network/components/organization-list";
import { listNetworkOrganizations } from "@/modules/network/organization-queries";

export default async function NetworkOrganizationsPage() {
  const viewer = await requireUser();
  return <OrganizationList organizations={listNetworkOrganizations(viewer)} />;
}
