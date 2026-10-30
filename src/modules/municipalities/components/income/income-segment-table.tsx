"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { IncomeSegmentSummary } from "../../income";
import { formatOrDash, ValueBar, type IncomeFormats } from "./income-shared";

export type IncomeSegment = { id: string; label: string; summary: IncomeSegmentSummary; extra?: string };

/** Market split along one dimension: how big each segment is and how much room it has. */
export function IncomeSegmentTable({ title, description, segments, formats, extraLabel, onSelect, selected }: {
  title: string;
  description: string;
  segments: IncomeSegment[];
  formats: IncomeFormats;
  extraLabel?: string;
  onSelect?: (id: string) => void;
  selected?: string;
}) {
  const t = useTranslations("municipalityIncome");
  const market = segments.reduce((sum, { summary }) => sum + summary.total, 0);
  const largest = Math.max(0, ...segments.map(({ summary }) => summary.total));
  return (
    <Card className="shadow-card">
      <CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("segment")}</TableHead>
              <TableHead className="text-right">{t("municipalities")}</TableHead>
              <TableHead className="min-w-40">{t("totalIncome")}</TableHead>
              <TableHead className="text-right">{t("marketShare")}</TableHead>
              <TableHead className="text-right">{t("medianPerCapita")}</TableHead>
              <TableHead className="text-right">{t("medianFiscalCapacity")}</TableHead>
              <TableHead className="text-right">{t("medianOperatingMargin")}</TableHead>
              <TableHead className="text-right">{t("negativeFreeBalance")}</TableHead>
              {extraLabel ? <TableHead className="text-right">{extraLabel}</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {segments.map(({ id, label, summary, extra }) => (
              <TableRow key={id} data-state={selected === id ? "selected" : undefined}>
                <TableCell className="font-medium">
                  {onSelect ? (
                    <button type="button" className="text-left underline-offset-2 hover:underline" aria-pressed={selected === id} onClick={() => onSelect(id)}>{label}</button>
                  ) : label}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formats.integer.format(summary.count)}</TableCell>
                <TableCell>
                  <div className="grid gap-1">
                    <span className="tabular-nums">{formats.compactCurrency.format(summary.total)}</span>
                    <ValueBar value={summary.total} maximum={largest} />
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{market > 0 ? formats.percent.format(summary.total / market) : "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{formatOrDash(formats.currency, summary.medianTotalPerCapita)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatOrDash(formats.currency, summary.medianFiscalCapacityPerCapita)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatOrDash(formats.percent, summary.medianOperatingMargin)}</TableCell>
                <TableCell className="text-right tabular-nums">{summary.count ? formats.percent.format(summary.negativeFreeBalance / summary.count) : "—"}</TableCell>
                {extraLabel ? <TableCell className="text-right tabular-nums">{extra ?? "—"}</TableCell> : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
