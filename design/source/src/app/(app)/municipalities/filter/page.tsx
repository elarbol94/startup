import { connection } from "next/server";
import { requireUser } from "@/lib/auth";
import { MunicipalityFilterClient } from "@/modules/municipalities/components/municipality-filter-client";
export default async function MunicipalityFilterPage() {
  await connection();
  await requireUser();
  return <MunicipalityFilterClient />;
}
