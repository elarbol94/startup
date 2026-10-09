import { requireUser } from "@/lib/auth";
import { localDateInZone } from "@/modules/calendar/date-utils";
import { NetworkMapView } from "@/modules/network/components/network-map-view";
import { parseNetworkMapParams } from "@/modules/network/network-map";
import { getNetworkMap } from "@/modules/network/network-map-queries";
import { TIME_ZONE } from "@/modules/time/lib/entry-time";

export default async function NetworkMapPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requireUser();
  const params = parseNetworkMapParams(await searchParams);
  const data = getNetworkMap(viewer, params.filter);
  return <NetworkMapView data={data} params={params} today={localDateInZone(new Date(), TIME_ZONE)} />;
}
