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
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip";
import { useKeyboardShortcut } from "@/components/use-keyboard-shortcut";
import { SECTION_PAGE_SHORTCUTS } from "@/lib/app-shortcuts";
import { AccountingPageHeader } from "@/modules/accounting/components/accounting-page-header";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
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

    const baseline = toY(0);
    const first = points[0];
    const last = points.at(-1);

    return {
      zeroY: min < 0 && max > 0 ? toY(0) : null,
      ticks: ticks.map((value) => ({ value, y: toY(value) })),
      points,
      path: points
        .map((point, index) =>
          `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`,
        )
        .join(" "),
      area: first && last && points.length > 1
        ? `${points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ")} L ${last.x} ${baseline} L ${first.x} ${baseline} Z`
        : null,
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
    <section
      aria-labelledby="accounting-cashflow-title"
      className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-card"
    >
      <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-line-soft px-[18px] py-3.5">
        <h2 id="accounting-cashflow-title" className="text-[15px] font-semibold">
          {t("cashflowTitle")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("cashflowDescription")}</p>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span className="size-2 rounded-full bg-brand" />
          {t("runningBalance")} (€)
        </div>
      </header>

      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 px-[18px] py-4">
        <div aria-hidden="true" className="relative col-start-1 row-start-1 h-48 min-w-9">
          {chart.ticks.map((tick) => (
            <span
              key={tick.value}
              className="absolute right-0 -translate-y-1/2 text-[10px] whitespace-nowrap text-text-tertiary tabular-nums sm:text-[11px]"
              style={{ top: `${(tick.y / CHART_HEIGHT) * 100}%` }}
            >
              {compactEuro(tick.value)}
            </span>
          ))}
        </div>
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="col-start-2 row-start-1 h-48 w-full overflow-visible text-brand"
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
              className="stroke-border"
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
              className="stroke-line-strong"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {chart.area && (
            <path d={chart.area} fill="currentColor" fillOpacity={0.12} stroke="none" />
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
              className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-brand bg-card"
              style={{
                left: `${(point.x / CHART_WIDTH) * 100}%`,
                top: `${(point.y / CHART_HEIGHT) * 100}%`,
              }}
            />
          ))}
        </div>
        <div className="relative col-start-2 row-start-2 mt-2 h-5 border-t border-line-soft pt-1">
          {months.map((month) => (
            <span
              key={month.month}
              className={cn(
                "absolute -translate-x-1/2 text-[10px] font-semibold tracking-[0.06em] text-text-tertiary uppercase sm:text-[11px]",
                month.month > throughMonth && "opacity-50",
              )}
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
    </section>
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
  function openNewEntry() {
    setDialogEntry(null);
    setDialogOpen(true);
  }
  useKeyboardShortcut(SECTION_PAGE_SHORTCUTS.accounting.newEntry, openNewEntry);

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
  // Money stays neutral (design 1b); only a negative result is flagged.
  const resultTone = totals.balance < 0 ? "text-late" : undefined;
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
      tone: undefined,
      detail: tOverview("incomeDetail"),
    },
    {
      label: t("expensePlural"),
      value: totals.expenseGross === 0 ? 0 : -totals.expenseGross,
      icon: ReceiptText,
      tone: undefined,
      detail: tOverview("expenseDetail"),
    },
    {
      label: tOverview("vatPosition"),
      value: vatBalance,
      icon: Landmark,
      tone: undefined,
      detail: tOverview("vatDetail"),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <AccountingPageHeader
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
            <ShortcutTooltip label={t("newEntry")} shortcut={SECTION_PAGE_SHORTCUTS.accounting.newEntry}>
              <Button className="h-9" onClick={openNewEntry}>
                <Plus className="size-4" />
                {t("newEntry")}
              </Button>
            </ShortcutTooltip>
          </>
        }
      />

      <section
        aria-label={tOverview("keyFigures")}
        className="grid grid-cols-2 overflow-hidden rounded-xl border bg-card shadow-card xl:grid-cols-4"
      >
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <article
              key={metric.label}
              className="min-w-0 px-[18px] py-4 shadow-[1px_0_0_var(--border),0_1px_0_var(--border)]"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[11px] font-semibold tracking-[0.12em] text-text-tertiary uppercase">
                  {metric.label}
                </p>
                <Icon className="hidden size-3.5 shrink-0 text-text-tertiary sm:block" aria-hidden="true" />
              </div>
              <p className={cn("mt-2 text-lg leading-tight font-semibold tracking-[-0.02em] break-words tabular-nums sm:text-2xl", metric.tone)}>
                {formatCents(metric.value, locale)}
              </p>
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{metric.detail}</p>
            </article>
          );
        })}
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.65fr)]">
        <CashflowChart months={months} year={year} throughMonth={throughMonth} />

        <section
          aria-labelledby="accounting-recent-title"
          className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-card"
        >
          <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-line-soft px-[18px] py-3.5">
            <h2 id="accounting-recent-title" className="text-[15px] font-semibold">
              {tOverview("recentTitle")}
            </h2>
            <p className="text-xs text-muted-foreground tabular-nums">
              {tOverview("bookingCount", { count: totals.bookingCount })}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              nativeButton={false}
              render={<Link href={`/accounting/bookings?year=${year}`} />}
            >
              {tOverview("openLedger")}
              <ArrowRight className="size-3.5" />
            </Button>
          </header>
          {recentEntries.length === 0 ? (
            <EmptyState compact icon={<BookOpenText />} title={t("noEntries")} />
          ) : (
            <Table className="text-[13.5px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-9 pl-[18px] text-[11.5px] font-medium text-muted-foreground">
                    {t("date")}
                  </TableHead>
                  <TableHead className="h-9 text-[11.5px] font-medium text-muted-foreground">
                    {t("description")}
                  </TableHead>
                  <TableHead className="hidden h-9 text-[11.5px] font-medium text-muted-foreground md:table-cell xl:hidden 2xl:table-cell">
                    {t("category")}
                  </TableHead>
                  <TableHead className="h-9 pr-[18px] text-right text-[11.5px] font-medium text-muted-foreground">
                    {t("gross")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentEntries.map((entry) => {
                  const sign = entry.kind === "expense" ? -1 : 1;
                  const canEdit =
                    canManagePersonnel || entry.categoryTemplate !== "personnel";
                  return (
                    <TableRow
                      key={entry.id}
                      tabIndex={canEdit ? 0 : undefined}
                      aria-disabled={canEdit ? undefined : true}
                      className={cn(
                        "h-[42px] border-line-soft hover:bg-transparent",
                        canEdit && "cursor-pointer hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
                      )}
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
                      <TableCell className="w-16 pl-[18px] align-top text-muted-foreground tabular-nums sm:align-middle">
                        {format.dateTime(new Date(`${entry.date}T00:00:00Z`), {
                          day: "2-digit",
                          month: "short",
                          timeZone: "UTC",
                        })}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <span className="flex min-w-0 items-start gap-2">
                          <span className="min-w-0 flex-1">
                            <span className="line-clamp-2 font-medium break-words">
                              {entry.description}
                            </span>
                            {entry.counterparty && (
                              <span className="block truncate text-xs text-muted-foreground">
                                {entry.counterparty}
                              </span>
                            )}
                          </span>
                          {entry.attachmentCount > 0 && (
                            <Paperclip className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell xl:hidden 2xl:table-cell">
                        <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: entry.categoryColor }}
                          />
                          {entry.categoryName}
                        </span>
                      </TableCell>
                      <TableCell className="pr-[18px] text-right align-top font-semibold tabular-nums sm:align-middle">
                        {formatCents(sign * entry.grossAmountCents, locale)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </section>
      </div>

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
