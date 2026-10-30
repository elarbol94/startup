"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ArrowDown, ArrowUp, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { IncomeMarketEntry } from "../../income";
import { formatOrDash, useProviderLabel, type IncomeFormats } from "./income-shared";

const PAGE_SIZE = 50;
const COLUMNS = [
  { id: "population", format: "integer", value: (entry: IncomeMarketEntry) => entry.population },
  { id: "total", format: "compactCurrency", value: (entry: IncomeMarketEntry) => entry.facts.total },
  { id: "totalPerCapita", format: "currency", value: (entry: IncomeMarketEntry) => entry.facts.totalPerCapita },
  { id: "fiscalCapacityPerCapita", format: "currency", value: (entry: IncomeMarketEntry) => entry.facts.fiscalCapacityPerCapita },
  { id: "ownShare", format: "percent", value: (entry: IncomeMarketEntry) => entry.facts.ownShare },
  { id: "operatingMargin", format: "percent", value: (entry: IncomeMarketEntry) => entry.facts.operatingMargin },
  { id: "freeBalancePerCapita", format: "currency", value: (entry: IncomeMarketEntry) => entry.facts.freeBalancePerCapita },
  { id: "growth", format: "signedPercent", value: (entry: IncomeMarketEntry) => entry.growth },
] as const;
type ColumnId = (typeof COLUMNS)[number]["id"];

export function IncomeRankingTable({ entries, formats, year, onSelect }: {
  entries: IncomeMarketEntry[];
  formats: IncomeFormats;
  year: number;
  onSelect: (code: string) => void;
}) {
  const t = useTranslations("municipalityIncome");
  const providerLabel = useProviderLabel();
  const [sort, setSort] = useState<ColumnId>("total");
  const [direction, setDirection] = useState<1 | -1>(-1);
  const [page, setPage] = useState({ key: "", count: PAGE_SIZE });
  const column = COLUMNS.find(({ id }) => id === sort)!;
  // Missing values always sink to the bottom, whichever way the column is sorted.
  const sorted = entries.toSorted((left, right) => {
    const a = column.value(left);
    const b = column.value(right);
    if (a === null || b === null) return a === null ? (b === null ? 0 : 1) : -1;
    return (a - b) * direction || left.name.localeCompare(right.name, formats.locale);
  });
  const pageKey = `${sort}|${direction}|${entries.length}`;
  const visible = sorted.slice(0, page.key === pageKey ? page.count : PAGE_SIZE);

  function updateSort(next: ColumnId) {
    if (next === sort) setDirection((value) => (value === 1 ? -1 : 1));
    else { setSort(next); setDirection(-1); }
  }

  function downloadCsv() {
    // Same convention as the investment export: separator and decimal mark follow the UI locale.
    const german = formats.locale.startsWith("de");
    const cell = (value: string | number | null) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const number = (value: number | null) => value === null ? "" : german ? String(Math.round(value * 100) / 100).replace(".", ",") : String(Math.round(value * 100) / 100);
    const header = [t("code"), t("municipality"), t("state"), t("provider"), ...COLUMNS.map(({ id }) => t(`column.${id}`))];
    const rows = sorted.map((entry) => [entry.code, entry.name, entry.state, providerLabel(entry.provider), ...COLUMNS.map(({ value }) => number(value(entry)))]);
    const csv = [header, ...rows].map((row) => row.map(cell).join(german ? ";" : ",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `gemeinde-einnahmen-${year}.csv`;
    link.click();
    // Revoking synchronously can cancel the download before the browser reads the blob.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle>{t("rankingTitle")}</CardTitle>
        <CardDescription>{t("rankingDescription", { count: entries.length })}</CardDescription>
        <CardAction><Button variant="outline" size="sm" onClick={downloadCsv} disabled={!entries.length}><Download className="size-4" />{t("downloadCsv")}</Button></CardAction>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("municipality")}</TableHead>
              <TableHead>{t("provider")}</TableHead>
              {COLUMNS.map(({ id }) => (
                <TableHead key={id} className="text-right" aria-sort={sort === id ? (direction === 1 ? "ascending" : "descending") : "none"}>
                  <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => updateSort(id)}>
                    {t(`column.${id}`)}
                    {sort === id ? (direction === 1 ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />) : null}
                  </button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((entry) => (
              <TableRow key={entry.code}>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <button type="button" className="font-medium underline-offset-2 hover:underline" onClick={() => onSelect(entry.code)}>{entry.name}</button>
                    <Link className="text-muted-foreground hover:text-foreground" href={`/municipalities/${entry.code}/income`} aria-label={t("openProfile", { municipality: entry.name })} title={t("openProfile", { municipality: entry.name })}>
                      <ExternalLink className="size-3.5" />
                    </Link>
                  </div>
                  <p className="text-xs text-muted-foreground">{entry.state}</p>
                </TableCell>
                <TableCell className="text-sm">{providerLabel(entry.provider)}</TableCell>
                {COLUMNS.map(({ id, format, value }) => (
                  <TableCell key={id} className="text-right tabular-nums">{formatOrDash(formats[format], value(entry))}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {visible.length < sorted.length ? (
          <div className="mt-4 flex justify-center">
            <Button variant="outline" onClick={() => setPage({ key: pageKey, count: visible.length + PAGE_SIZE })}>
              {t("showMore", { shown: visible.length, total: sorted.length })}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
