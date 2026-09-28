import { requireUser } from "@/lib/auth";
import { ContactList } from "@/modules/network/components/contact-list";
import { parseContactListParams } from "@/modules/network/contact-filters";
import { listNetworkContacts } from "@/modules/network/queries";

export default async function NetworkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requireUser();
  const data = listNetworkContacts(viewer, parseContactListParams(await searchParams));
  return <ContactList data={data} />;
}
