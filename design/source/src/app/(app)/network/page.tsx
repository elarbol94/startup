import { requireUser } from "@/lib/auth";
import { localDateInZone } from "@/modules/calendar/date-utils";
import { ContactList } from "@/modules/network/components/contact-list";
import { parseContactListParams } from "@/modules/network/contact-filters";
import { listNetworkContacts } from "@/modules/network/queries";
import { TIME_ZONE } from "@/modules/time/lib/entry-time";

export default async function NetworkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requireUser();
  const data = listNetworkContacts(viewer, parseContactListParams(await searchParams));
  return <ContactList data={data} today={localDateInZone(new Date(), TIME_ZONE)} />;
}
