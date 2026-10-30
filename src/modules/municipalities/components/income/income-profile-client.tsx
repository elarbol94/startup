"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ArrowLeft, Coins, Landmark } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { compoundAnnualGrowth, INCOME_CATEGORIES, populationClassIndex } from "../../income";
import type { MunicipalityIncomeProfile } from "../../income-data.server";
import { AnalysisSeriesChart } from "../analysis-series-chart";
import {
  CompositionBar, Filter, SELECT_CLASS, StatGrid, ValueBar, formatOrDash, populationClassLabel, useIncomeFormats, useProviderLabel,
} from "./income-shared";

export function IncomeProfileClient({ profile, hasInvestments }: { profile: MunicipalityIncomeProfile; hasInvestments: boolean }) {
  const t = useTranslations("municipalityIncome");
  const formats = useIncomeFormats();
  const providerLabel = useProviderLabel();
  const latest = profile.years.at(-1)!;
  const [year, setYear] = useState(latest.year);
  const selected = profile.years.find((item) => item.year === year) ?? latest;
  const earlier = profile.years.find((item) => item.year === selected.year - 5);
  const rank = (value: number | null) => value === null ? "—" : t("rank", { percentile: Math.round(value * 100) });
  const perCapitaSeries = (pick: (item: MunicipalityIncomeProfile["years"][number]) => number | null) => ({
    unit: "currency-per-person", valueType: "number" as const, error: null, warnings: [],
    points: profile.years.map((item) => ({ year: item.year, value: pick(item) })),
  });
  const largestCategory = Math.max(0, ...selected.categories.map(Math.abs));
  const population = selected.population;

  return (
    <div className="space-y-4 pb-8">
      <header className="flex flex-col gap-4 rounded-xl border bg-card px-[18px] py-4 shadow-card md:flex-row md:items-end md:justify-between">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-3" render={<Link href={`/municipalities/overview?municipality=${profile.municipality.code}`} />}>
            <ArrowLeft className="size-4" />{t("back")}
          </Button>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-brand-ink uppercase">{t("eyebrow")}</p>
          <h2 className="mt-1 text-[22px] leading-tight font-semibold tracking-[-0.02em]">{profile.municipality.name}</h2>
          <p className="mt-1 max-w-3xl text-[13.5px] text-muted-foreground">{t("profileDescription")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="outline">{profile.municipality.state}</Badge>
            <Badge variant="outline">{profile.municipality.code}</Badge>
            <Badge variant="outline">{t("provider")}: {providerLabel(profile.provider)}</Badge>
            {latest.population ? <Badge variant="outline">{t("peerGroup", { range: populationClassLabel(populationClassIndex(latest.population), formats.integer), count: profile.peerCount })}</Badge> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Button variant="outline" render={<Link href="/municipalities/income" />}><Coins className="size-4" />{t("toMarket")}</Button>
          {hasInvestments ? <Button variant="outline" render={<Link href={`/municipalities/${profile.municipality.code}/investments`} />}><Landmark className="size-4" />{t("toInvestments")}</Button> : null}
          <Filter label={t("year")}>
            <select className={`${SELECT_CLASS} w-28`} value={selected.year} onChange={(event) => setYear(Number(event.target.value))}>
              {[...profile.years].reverse().map((item) => <option key={item.year} value={item.year}>{item.year}</option>)}
            </select>
          </Filter>
        </div>
      </header>

      <StatGrid label={t("summary")} items={[
        { label: t("totalIncome"), value: formats.compactCurrency.format(selected.facts.total), note: t("yearNote", { year: selected.year }) },
        { label: t("column.totalPerCapita"), value: formatOrDash(formats.currency, selected.facts.totalPerCapita), note: selected.year === latest.year ? rank(profile.peerRanks.totalPerCapita) : t("peerMedian", { value: formatOrDash(formats.currency, selected.peerMedianPerCapita) }) },
        { label: t("column.fiscalCapacityPerCapita"), value: formatOrDash(formats.currency, selected.facts.fiscalCapacityPerCapita), note: selected.year === latest.year ? rank(profile.peerRanks.fiscalCapacityPerCapita) : undefined },
        { label: t("column.freeBalancePerCapita"), value: formatOrDash(formats.currency, selected.facts.freeBalancePerCapita), note: selected.year === latest.year ? rank(profile.peerRanks.freeBalancePerCapita) : undefined },
        { label: t("column.ownShare"), value: formatOrDash(formats.percent, selected.facts.ownShare), note: selected.year === latest.year ? rank(profile.peerRanks.ownShare) : undefined },
        { label: t("column.operatingMargin"), value: formatOrDash(formats.percent, selected.facts.operatingMargin), note: t("operatingBalance", { value: formats.compactCurrency.format(selected.facts.operatingBalance) }) },
        { label: t("loans"), value: formats.compactCurrency.format(selected.facts.loans), note: t("loansNote") },
        { label: t("column.growth"), value: formatOrDash(formats.signedPercent, compoundAnnualGrowth(earlier?.facts.totalPerCapita, selected.facts.totalPerCapita, 5)), note: t("growthNote", { from: selected.year - 5, to: selected.year }) },
      ]} />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader><CardTitle>{t("perCapitaTrend")}</CardTitle><CardDescription>{t("perCapitaTrendDescription")}</CardDescription></CardHeader>
          <CardContent className="grid gap-4">
            <AnalysisSeriesChart series={perCapitaSeries((item) => item.facts.totalPerCapita)} label={profile.municipality.name} trueLabel="" falseLabel="" />
            <p className="text-xs font-semibold text-muted-foreground">{t("peerMedianSeries")}</p>
            <AnalysisSeriesChart series={perCapitaSeries((item) => item.peerMedianPerCapita)} label={t("peerMedianSeries")} compact trueLabel="" falseLabel="" />
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardHeader><CardTitle>{t("compositionTitle")}</CardTitle><CardDescription>{t("compositionDescription", { year: selected.year })}</CardDescription></CardHeader>
          <CardContent><CompositionBar categories={selected.categories} groupLabel={(id) => t(`group.${id}`)} formats={formats} label={t("compositionTitle")} /></CardContent>
        </Card>
      </div>

      <Card className="shadow-card">
        <CardHeader><CardTitle>{t("categoryTitle")}</CardTitle><CardDescription>{t("categoryDescription", { year: selected.year })}</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("categoryLabel")}</TableHead>
                <TableHead className="min-w-40">{t("amount")}</TableHead>
                <TableHead className="text-right">{t("share")}</TableHead>
                <TableHead className="text-right">{t("perCapita")}</TableHead>
                {selected.year === latest.year ? <TableHead className="text-right">{t("peerMedianPerCapita")}</TableHead> : null}
                <TableHead className="text-right">{t("column.growth")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {INCOME_CATEGORIES.map(({ id }, index) => {
                const amount = selected.categories[index];
                const perCapita = population ? amount / population : null;
                const past = earlier && earlier.population ? earlier.categories[index] / earlier.population : null;
                return (
                  <TableRow key={id}>
                    <TableCell><p className="font-medium">{t(`category.${id}`)}</p><p className="text-xs text-muted-foreground">{t(`categoryHint.${id}`)}</p></TableCell>
                    <TableCell><div className="grid gap-1"><span className="tabular-nums">{formats.currency.format(amount)}</span><ValueBar value={amount} maximum={largestCategory} /></div></TableCell>
                    <TableCell className="text-right tabular-nums">{selected.facts.total > 0 ? formats.percent.format(amount / selected.facts.total) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatOrDash(formats.currency, perCapita)}</TableCell>
                    {selected.year === latest.year ? <TableCell className="text-right tabular-nums">{formatOrDash(formats.currency, profile.categoryPeerMedians[id])}</TableCell> : null}
                    <TableCell className="text-right tabular-nums">{formatOrDash(formats.signedPercent, compoundAnnualGrowth(past, perCapita, 5))}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader><CardTitle>{t("historyTitle")}</CardTitle><CardDescription>{t("historyDescription")}</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("year")}</TableHead>
                <TableHead className="text-right">{t("column.population")}</TableHead>
                <TableHead className="text-right">{t("totalIncome")}</TableHead>
                <TableHead className="text-right">{t("column.totalPerCapita")}</TableHead>
                <TableHead className="text-right">{t("peerMedianPerCapita")}</TableHead>
                <TableHead className="text-right">{t("fiscalCapacityTotal")}</TableHead>
                <TableHead className="text-right">{t("operatingBalanceLabel")}</TableHead>
                <TableHead className="text-right">{t("freeBalanceTotal")}</TableHead>
                <TableHead className="text-right">{t("loans")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...profile.years].reverse().map((item) => (
                <TableRow key={item.year} data-state={item.year === selected.year ? "selected" : undefined}>
                  <TableCell><button type="button" className="font-medium underline-offset-2 hover:underline" onClick={() => setYear(item.year)}>{item.year}</button></TableCell>
                  <TableCell className="text-right tabular-nums">{formatOrDash(formats.integer, item.population)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formats.compactCurrency.format(item.facts.total)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatOrDash(formats.currency, item.facts.totalPerCapita)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatOrDash(formats.currency, item.peerMedianPerCapita)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formats.compactCurrency.format(item.facts.fiscalCapacity)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${item.facts.operatingBalance < 0 ? "text-destructive" : ""}`}>{formats.compactCurrency.format(item.facts.operatingBalance)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${item.facts.freeBalance < 0 ? "text-destructive" : ""}`}>{formats.compactCurrency.format(item.facts.freeBalance)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formats.compactCurrency.format(item.facts.loans)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">{t("methodology")}</p>
    </div>
  );
}
