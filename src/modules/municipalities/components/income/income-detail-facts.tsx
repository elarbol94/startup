"use client";

// The selected Gemeinde's income figures in the map's details panel while the Kostenübersicht
// shows an income view, with the way into the full income profile.
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { municipalityIncomeFacts, type MunicipalityIncomeSeries } from "../../income";
import { formatOrDash, useIncomeFormats } from "./income-shared";

export function IncomeDetailFacts({ series, code, year, population }: {
  series: MunicipalityIncomeSeries;
  code: string;
  year: number;
  population: number | undefined;
}) {
  const t = useTranslations("municipalityIncome");
  const formats = useIncomeFormats();
  const value = series.years[String(year)]?.values[code];
  const facts = value ? municipalityIncomeFacts(value, population) : null;
  const rows: Array<[string, string, boolean?]> = facts ? [
    [t("totalIncome"), formats.compactCurrency.format(facts.total)],
    [t("column.totalPerCapita"), formatOrDash(formats.currency, facts.totalPerCapita)],
    [t("column.fiscalCapacityPerCapita"), formatOrDash(formats.currency, facts.fiscalCapacityPerCapita)],
    [t("column.ownShare"), formatOrDash(formats.percent, facts.ownShare)],
    [t("operatingBalanceLabel"), formats.compactCurrency.format(facts.operatingBalance), facts.operatingBalance < 0],
    [t("freeBalanceTotal"), formats.compactCurrency.format(facts.freeBalance), facts.freeBalance < 0],
    [t("loans"), formats.compactCurrency.format(facts.loans)],
  ] : [];
  return (
    <section data-testid="income-detail-facts">
      <h3 className="text-[11px] font-semibold tracking-[0.12em] text-text-tertiary uppercase">{t("eyebrow")} · {year}</h3>
      {facts ? (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-[13.5px]">
          {rows.map(([label, text, negative]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className={`font-medium tabular-nums ${negative ? "text-destructive" : ""}`}>{text}</dd>
            </div>
          ))}
        </dl>
      ) : <p className="mt-2 text-[13px] text-muted-foreground">{t("noStatement", { year })}</p>}
      <Button nativeButton={false} variant="outline" className="mt-3 w-full" render={<Link href={`/municipalities/${code}/income`} />}>
        <Coins className="size-4" />{t("openProfileButton")}
      </Button>
    </section>
  );
}
