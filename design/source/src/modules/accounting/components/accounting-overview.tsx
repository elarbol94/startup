"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpenText,
  Landmark,
  Paperclip,
  Plus,
  ReceiptText,
  Scale,
} from "lucide-react";
import { formatCents } from "@/lib/money";
import type {
  EntryRow,
  MonthlySummary,
} from "@/modules/accounting/queries";
import type { categories as categoriesTable } from "@/modules/accounting/schema";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
const EntryDialog = dynamic(() =>
  import("./entry-dialog").then((module) => module.EntryDialog),
);

type Category = typeof categoriesTable.$inferSelect;

const CHART_WIDTH = 720;
const CHART_HEIGHT = 190;
const CHART_X_PADDING = 18;
const CHART_Y_PADDING = 14;
const TICK_TARGET = 4;

/** Rounds a raw axis step up to 1, 2, 2.5 or 5 × 10^n for readable tick labels. */
function niceStep(raw: number) {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * power;
}

/** Month labels are built in UTC so server and browser render the same text. */
function monthDate(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1));
}

function CashflowChart({
  months,
  year,
  throughMonth,
}: {
  months: MonthlySummary[];
  year: number;
  /** Last month (1–12) to plot; later months of the current year are not drawn. 0 = none. */
  throughMonth: number;
}) {
  const t = useTranslations("accountingOverview");
  const format = useFormatter();

  const chart = useMemo(() => {
    // Display-only: cumulative balance in cents, converted to euros for the axis.
    const balances = months.reduce<number[]>((values, month) => {
      const previous = values.at(-1) ?? 0;
      return [
        ...values,
        previous + month.incomeGross - month.expenseGross,
      ];
    }, []);
    const shown = balances
      .map((value, index) => ({ value: value / 100, month: months[index].month }))
      .filter((point) => point.month <= throughMonth);
    const rawMin = Math.min(0, ...shown.map((point) => point.value));
    const rawMax = Math.max(0, ...shown.map((point) => point.value));
    const step = niceStep((rawMax - rawMin) / TICK_TARGET || 1);
    const min = Math.floor(rawMin / step) * step;
    const max = Math.max(Math.ceil(rawMax / step) * step, min + step);
    const range = max - min;
    const plotHeight = CHART_HEIGHT - CHART_Y_PADDING * 2;
    const plotWidth = CHART_WIDTH - CHART_X_PADDING * 2;
    const toY = (value: number) =>
      CHART_Y_PADDING + ((max - value) / range) * plotHeight;
    const ticks: number[] = [];
    for (let value = max; value >= min - step / 2; value -= step) {
      ticks.push(Math.abs(value) < step / 2 ? 0 : value);
    }
    const points = shown.map((point) => ({
      ...point,
      x: CHART_X_PADDING + ((point.month - 1) * plotWidth) / 11,
      y: toY(point.value),
    }));

    return {
      zeroY: min < 0 && max > 0 ? toY(0) : null,
      ticks: ticks.map((value) => ({ value, y: toY(value) })),
      points,
      path: points
        .map((point, index) =>
          `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`,
        )
        .join(" "),
    };
  }, [months, throughMonth]);

  function compactEuro(value: number) {
    const abs = Math.abs(value);
    const sign = value < 0 ? "\u2212" : "";
    if (abs >= 1_000_000) {
      return `${sign}${format.number(abs / 1_000_000, { maximumFractionDigits: 1 })} Mio`;
    }
    if (abs >= 1_000) {
      return `${sign}${format.number(abs / 1_000, { maximumFractionDigits: 1 })} k`;
    }
    return `${sign}${format.number(abs, { maximumFractionDigits: 0 })}`;
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.015em] text-[#17342d] dark:text-foreground">
            {t("cashflowTitle")}
          </h2>
          <p className="mt-1 text-sm text-[#6f7d78] dark:text-muted-foreground">
            {t("cashflowDescription")}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-[#61706b] dark:text-muted-foreground">
          <span className="size-2 rounded-full bg-[#315c73] dark:bg-sky-400" />
          {t("runningBalance")} (€)
        </div>
      </div>

      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
        <div aria-hidden="true" className="relative col-start-1 row-start-1 h-48 min-w-9">
          {chart.ticks.map((tick) => (
            <span
              key={tick.value}
              className="absolute right-0 -translate-y-1/2 text-[10px] whitespace-nowrap tabular-nums text-[#87938f] dark:text-muted-foreground sm:text-[11px]"
              style={{ top: `${(tick.y / CHART_HEIGHT) * 100}%` }}
            >
              {compactEuro(tick.value)}
            </span>
          ))}
        </div>
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="col-start-2 row-start-1 h-48 w-full overflow-visible text-[#315c73] dark:text-sky-400"
          preserveAspectRatio="none"
          role="img"
          aria-label={t("chartLabel", { year })}
        >
          {chart.ticks.map((tick) => (
            <line
              key={tick.value}
              x1={0}
              x2={CHART_WIDTH}
              y1={tick.y}
              y2={tick.y}
              className="stroke-[#e1e7e3] dark:stroke-border"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
              strokeDasharray="3 5"
            />
          ))}
          {chart.zeroY !== null && (
            <line
              x1={0}
              x2={CHART_WIDTH}
              y1={chart.zeroY}
              y2={chart.zeroY}
              className="stroke-[#9eada7] dark:stroke-muted-foreground"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          )}
          <path
            d={chart.path}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {/* Point markers live in HTML so they stay round despite the stretched SVG. */}
        <div aria-hidden="true" className="pointer-events-none relative col-start-2 row-start-1 h-48">
          {chart.points.map((point) => (
            <span
              key={point.month}
              className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#315c73] bg-white dark:border-sky-400 dark:bg-card"
              style={{
                left: `${(point.x / CHART_WIDTH) * 100}%`,
                top: `${(point.y / CHART_HEIGHT) * 100}%`,
              }}
            />
          ))}
        </div>
        <div className="relative col-start-2 row-start-2 mt-2 h-5 border-t border-[#e3e8e5] dark:border-border pt-1">
          {months.map((month) => (
            <span
              key={month.month}
              className={`absolute -translate-x-1/2 text-[10px] font-semibold tracking-[0.06em] uppercase sm:text-[11px] ${
                month.month <= throughMonth
                  ? "text-[#87938f] dark:text-muted-foreground"
                  : "text-[#b7c0bc] dark:text-muted-foreground/50"
              }`}
              style={{ left: `${((CHART_X_PADDING + ((month.month - 1) * (CHART_WIDTH - CHART_X_PADDING * 2)) / 11) / CHART_WIDTH) * 100}%` }}
            >
              {format.dateTime(monthDate(year, month.month), {
                month: "narrow",
                timeZone: "UTC",
              })}
            </span>
          ))}
        </div>
      </div>

      <table className="sr-only">
        <caption>{t("chartLabel", { year })}</caption>
        <thead>
          <tr>
            <th>{t("month")}</th>
            <th>{t("income")}</th>
            <th>{t("expenses")}</th>
          </tr>
        </thead>
        <tbody>
          {months.filter((month) => month.month <= throughMonth).map((month) => (
            <tr key={month.month}>
              <td>
                {format.dateTime(monthDate(year, month.month), {
                  month: "long",
                  timeZone: "UTC",
                })}
              </td>
              <td>{month.incomeGross}</td>
              <td>{month.expenseGross}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AccountingOverview({
  entries,
  months,
  totals,
  vatBalance,
  categories,
  years,
  year,
  throughMonth,
  openEntryOnLoad,
  canManagePersonnel,
  taxSettings,
  fundingProjects,
  personnelEmployees,
  personnelLocations,
  payrollMonthContexts,
}: {
  entries: EntryRow[];
  months: MonthlySummary[];
  totals: { incomeGross: number; expenseGross: number; balance: number; bookingCount: number };
  vatBalance: number;
  categories: Category[];
  years: number[];
  year: number;
  /** Last month of `year` with actuals (12 for past years, current month for this year). */
  throughMonth: number;
  openEntryOnLoad: boolean;
  canManagePersonnel: boolean;
  taxSettings: { kleinunternehmer: boolean; defaultVatRate: number };
  fundingProjects: Array<{ id: string; name: string }>;
  personnelEmployees: Array<{ id: string; name: string; userId: string | null; personnelNumber: string; employmentType: string; locationId: string | null }>;
  personnelLocations: Array<{ id: string; name: string; state: string; municipality: string }>;
  payrollMonthContexts: Array<{ payrollMonth: string; internalPayrollCents: number; externalPayrollCents: number; externalMarginalPayrollCents: number; marginalPayrollCents: number }>;
}) {
  const t = useTranslations("accounting");
  const tOverview = useTranslations("accountingOverview");
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dialogEntry, setDialogEntry] = useState<EntryRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(openEntryOnLoad);

  function setEntryDialogOpen(nextOpen: boolean) {
    setDialogOpen(nextOpen);
    if (nextOpen || !searchParams.has("new")) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("new");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      query ? `/accounting?${query}` : "/accounting",
    );
  }

  function changeYear(value: string | null) {
    if (!value) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", value);
    router.push(`/accounting?${params.toString()}`);
  }

  const recentEntries = entries.slice(0, 6);
  const resultTone = totals.balance >= 0 ? "text-[#2f6b55] dark:text-emerald-400" : "text-[#a64f3c] dark:text-red-400";
  const metrics = [
    {
      label: tOverview("result"),
      value: totals.balance,
      icon: Scale,
      tone: resultTone,
      detail: tOverview("resultDetail"),
    },
    {
      label: t("incomePlural"),
      value: totals.incomeGross,
      icon: ArrowUpRight,
      tone: "text-[#2f6b55] dark:text-emerald-400",
      detail: tOverview("incomeDetail"),
    },
    {
      label: t("expensePlural"),
      value: totals.expenseGross === 0 ? 0 : -totals.expenseGross,
      icon: ReceiptText,
      tone: "text-[#17342d] dark:text-foreground",
      detail: tOverview("expenseDetail"),
    },
    {
      label: tOverview("vatPosition"),
      value: vatBalance,
      icon: Landmark,
      tone: vatBalance > 0 ? "text-[#a36525] dark:text-amber-400" : "text-[#315c73] dark:text-foreground",
      detail: tOverview("vatDetail"),
    },
  ];

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <PageHeader
        className="mb-0"
        title={tOverview("title", { year })}
        description={tOverview("description")}
        actions={
          <>
            <Select value={String(year)} onValueChange={changeYear}>
              <SelectTrigger className="h-9 min-w-28" aria-label={t("year")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((item) => (
                  <SelectItem key={item} value={String(item)}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className="h-9"
              onClick={() => {
                setDialogEntry(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="size-4" />
              {t("newEntry")}
            </Button>
          </>
        }
      />

      <section
        aria-label={tOverview("keyFigures")}
        className="grid grid-cols-2 overflow-hidden rounded-2xl border border-[#dfe5e1] dark:border-border bg-white dark:bg-card shadow-[0_1px_2px_rgba(20,47,39,0.03)] xl:grid-cols-4"
      >
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          return (
            <article
              key={metric.label}
              className={cn(
                "relative min-w-0 p-3.5 sm:p-6",
                index % 2 === 1 && "border-l border-[#e3e8e5] dark:border-border",
                index >= 2 && "border-t border-[#e3e8e5] dark:border-border xl:border-t-0",
                index === 2 && "xl:border-l",
              )}
            >
              <div className="mb-2 flex items-start justify-between gap-2 sm:mb-5">
                <p className="text-[11px] font-semibold tracking-[0.06em] text-[#73817c] dark:text-muted-foreground uppercase sm:text-xs sm:tracking-[0.08em]">
                  {metric.label}
                </p>
                <Icon className="hidden size-4 shrink-0 text-[#8b9793] dark:text-muted-foreground sm:block" />
              </div>
              <p className={`text-base font-semibold tracking-[-0.02em] tabular-nums break-words sm:text-2xl sm:tracking-[-0.035em] ${metric.tone}`}>
                {formatCents(metric.value, locale)}
              </p>
              <p className="mt-1 text-[11px] leading-snug text-[#88938f] dark:text-muted-foreground sm:mt-1.5 sm:text-xs">{metric.detail}</p>
            </article>
          );
        })}
      </section>

      <section className="rounded-2xl border border-[#dfe5e1] dark:border-border bg-white dark:bg-card p-4 shadow-[0_1px_2px_rgba(20,47,39,0.03)] sm:p-6">
        <CashflowChart months={months} year={year} throughMonth={throughMonth} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#dfe5e1] dark:border-border bg-white dark:bg-card shadow-[0_1px_2px_rgba(20,47,39,0.03)]">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-[#e3e8e5] dark:border-border px-4 py-3.5 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-[-0.015em] text-[#17342d] dark:text-foreground">
              {tOverview("recentTitle")}
            </h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-[#7a8782] dark:text-muted-foreground">
              <BookOpenText className="size-3.5 shrink-0" aria-hidden="true" />
              {tOverview("bookingCount", { count: totals.bookingCount })}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href={`/accounting/bookings?year=${year}`} />}
          >
            {tOverview("openLedger")}
            <ArrowRight className="size-4" />
          </Button>
        </div>
        <Table>
          <TableHeader className="bg-[#f8faf8] dark:bg-muted">
            <TableRow className="border-[#e3e8e5] dark:border-border hover:bg-transparent">
              <TableHead className="h-9 pl-4 text-[11px] font-semibold tracking-[0.08em] text-[#7b8883] dark:text-muted-foreground uppercase sm:pl-6">
                {t("date")}
              </TableHead>
              <TableHead className="h-9 text-[11px] font-semibold tracking-[0.08em] text-[#7b8883] dark:text-muted-foreground uppercase">
                {t("description")}
              </TableHead>
              <TableHead className="hidden h-9 text-[11px] font-semibold tracking-[0.08em] text-[#7b8883] dark:text-muted-foreground uppercase md:table-cell">
                {t("category")}
              </TableHead>
              <TableHead className="h-9 pr-4 text-right text-[11px] font-semibold tracking-[0.08em] text-[#7b8883] dark:text-muted-foreground uppercase sm:pr-6">
                {t("gross")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recentEntries.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center text-sm text-[#7a8782] dark:text-muted-foreground">
                  {t("noEntries")}
                </TableCell>
              </TableRow>
            )}
            {recentEntries.map((entry) => {
              const sign = entry.kind === "expense" ? -1 : 1;
              const canEdit =
                canManagePersonnel || entry.categoryTemplate !== "personnel";
              return (
                <TableRow
                  key={entry.id}
                  tabIndex={canEdit ? 0 : undefined}
                  aria-disabled={canEdit ? undefined : true}
                  className={canEdit
                    ? "cursor-pointer border-[#edf0ee] dark:border-border hover:bg-[#f6f9f7] dark:hover:bg-accent focus-visible:bg-[#f0f5f2] dark:focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#315c73] dark:focus-visible:ring-ring"
                    : "border-[#edf0ee] dark:border-border"}
                  onClick={() => {
                    if (!canEdit) return;
                    setDialogEntry(entry);
                    setDialogOpen(true);
                  }}
                  onKeyDown={(event) => {
                    if (!canEdit || (event.key !== "Enter" && event.key !== " ")) return;
                    event.preventDefault();
                    setDialogEntry(entry);
                    setDialogOpen(true);
                  }}
                >
                  <TableCell className="w-16 pl-4 align-top text-[#68756f] dark:text-muted-foreground sm:w-24 sm:pl-6 sm:align-middle">
                    {format.dateTime(new Date(`${entry.date}T00:00:00Z`), {
                      day: "2-digit",
                      month: "short",
                      timeZone: "UTC",
                    })}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <span className="flex min-w-0 items-start gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 font-medium break-words text-[#213c35] dark:text-foreground">
                          {entry.description}
                        </span>
                        {entry.counterparty && (
                          <span className="block truncate text-xs text-[#84908c] dark:text-muted-foreground">
                            {entry.counterparty}
                          </span>
                        )}
                      </span>
                      {entry.attachmentCount > 0 && (
                        <Paperclip className="mt-1 size-3.5 shrink-0 text-[#83918b] dark:text-muted-foreground" />
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="inline-flex items-center gap-2 text-xs text-[#63716c] dark:text-muted-foreground">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: entry.categoryColor }}
                      />
                      {entry.categoryName}
                    </span>
                  </TableCell>
                  <TableCell
                    className={`pr-4 text-right align-top font-semibold tabular-nums sm:pr-6 sm:align-middle ${
                      entry.kind === "income" ? "text-[#2f6b55] dark:text-emerald-400" : "text-[#273f38] dark:text-foreground"
                    }`}
                  >
                    {formatCents(sign * entry.grossAmountCents, locale)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>

      {dialogOpen && <EntryDialog
        open={dialogOpen}
        onOpenChange={setEntryDialogOpen}
        entry={dialogEntry}
        categories={categories}
        canManagePersonnel={canManagePersonnel}
        taxSettings={taxSettings}
        fundingProjects={fundingProjects}
        personnelEmployees={personnelEmployees}
        personnelLocations={personnelLocations}
        payrollMonthContexts={payrollMonthContexts}
      />}
    </div>
  );
}
