import { connection } from "next/server";
import { requireUser } from "@/lib/auth";
import { MunicipalityFilterClient } from "@/modules/municipalities/components/municipality-filter-client";
import { listMunicipalityMetricsForUser } from "@/modules/municipalities/queries";
export default async function MunicipalityFilterPage() {
  await connection();
  const user = await requireUser();
  return <MunicipalityFilterClient metrics={listMunicipalityMetricsForUser(user.id)} />;
}
