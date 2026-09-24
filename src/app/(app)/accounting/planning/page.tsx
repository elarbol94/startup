import { getLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import {
  planningOverview,
  yearsWithEntries,
  yearsWithPlans,
} from "@/modules/accounting/queries";
import { PlanningClient } from "@/modules/accounting/components/planning-client";

export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const year =
    params.year && /^\d{4}$/.test(params.year)
      ? Number(params.year)
      : new Date().getFullYear();
  const locale = await getLocale();
  const rows = planningOverview(year);
  const currentYear = new Date().getFullYear();
  const years = [
    ...new Set([
      currentYear - 1,
      currentYear,
      currentYear + 1,
      year,
      ...yearsWithEntries(),
      ...yearsWithPlans(),
    ]),
  ].sort((a, b) => b - a);

  return <PlanningClient key={year} rows={rows} year={year} years={years} locale={locale} />;
}
