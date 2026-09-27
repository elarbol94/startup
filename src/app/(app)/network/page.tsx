import { requireUser } from "@/lib/auth";
import { ContactList } from "@/modules/network/components/contact-list";
import { listNetworkContacts } from "@/modules/network/queries";

export default async function NetworkPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string }>;
}) {
  const viewer = await requireUser();
  const params = await searchParams;
  const query = params.q?.slice(0, 200) ?? "";
  const data = listNetworkContacts(viewer, { query, tagId: params.tag });
  return <ContactList data={data} query={query} tagId={params.tag ?? ""} />;
}
