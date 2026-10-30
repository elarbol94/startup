import { getTranslations } from "next-intl/server";
import { Coins } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth";
import { IncomeMarketClient } from "@/modules/municipalities/components/income/income-market-client";
import { loadMunicipalityIncomeMarket } from "@/modules/municipalities/income-data.server";

export default async function MunicipalityIncomeMarketPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();
  const query = await searchParams;
  const pick = (key: string) => typeof query[key] === "string" ? query[key] : undefined;
  const market = await loadMunicipalityIncomeMarket(Number(pick("year")) || undefined);
  if (!market) {
    const t = await getTranslations("municipalityIncome");
    return <EmptyState icon={<Coins />} title={t("missingTitle")} description={t("missingDescription")} />;
  }
  const app = pick("app");
  return (
    <IncomeMarketClient
      key={market.year}
      market={market}
      initialFilters={{
        state: market.entries.some(({ state }) => state === pick("state")) ? pick("state") : undefined,
        populationClass: /^[0-5]$/.test(pick("class") ?? "") ? pick("class") : undefined,
        app: app === "with-app" || app === "without-app" || app === "unknown" ? app : undefined,
        query: pick("q")?.slice(0, 200),
      }}
    />
  );
}
