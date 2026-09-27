import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { localDateInZone } from "@/modules/calendar/date-utils";
import { ContactDetail } from "@/modules/network/components/contact-detail";
import { listNetworkOrganizationNames } from "@/modules/network/organization-queries";
import { getNetworkContact, listNetworkContactOptions, listNetworkTagNames } from "@/modules/network/queries";
import { TIME_ZONE } from "@/modules/time/lib/entry-time";

export default async function NetworkContactPage({ params }: { params: Promise<{ contactId: string }> }) {
  const viewer = await requireUser();
  const { contactId } = await params;
  // Private contacts of others answer 404, the same as missing ones.
  const contact = getNetworkContact(viewer, contactId);
  if (!contact) notFound();
  return (
    <ContactDetail
      contact={contact}
      contacts={listNetworkContactOptions(viewer)}
      tagSuggestions={listNetworkTagNames(viewer)}
      organizationNames={listNetworkOrganizationNames(viewer)}
      today={localDateInZone(new Date(), TIME_ZONE)}
    />
  );
}
