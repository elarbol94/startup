import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { IncomeProfileClient } from "@/modules/municipalities/components/income/income-profile-client";
import { loadMunicipalityIncomeProfile } from "@/modules/municipalities/income-data.server";
import { hasMunicipalityInvestmentData } from "@/modules/municipalities/investment-data.server";

export default async function MunicipalityIncomePage({ params }: { params: Promise<{ municipalityCode: string }> }) {
  await requireUser();
  const { municipalityCode } = await params;
  const [profile, investments] = await Promise.all([
    loadMunicipalityIncomeProfile(municipalityCode),
    hasMunicipalityInvestmentData(municipalityCode),
  ]);
  if (!profile) notFound();
  return <IncomeProfileClient profile={profile} hasInvestments={investments} />;
}
