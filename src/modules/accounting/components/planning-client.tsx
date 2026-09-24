"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronLeft, ChevronRight, Save } from "lucide-react";
import { toast } from "sonner";
import { savePlanning, type PlanningInput } from "../actions";
import type { PlanningRow } from "../queries";
import { formatCents, parseAmountToCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Draft = Record<string, string[]>;
type Kind = PlanningRow["kind"];

const KINDS = ["income", "expense"] as const satisfies readonly Kind[];

/** Grouped display locale for amounts (de → "38.850,00"). */
const DISPLAY_LOCALES: Record<string, string> = { de: "de", en: "en-IE" };

function amountForInput(cents: number, locale: string) {
  if (cents === 0) return "";
  return new Intl.NumberFormat(locale, {
    useGrouping: false,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function initialDraft(rows: PlanningRow[], locale: string): Draft {
  return Object.fromEntries(
    rows.map((row) => [
      row.categoryId,
      row.plannedByMonth.map((amount) => amountForInput(amount, locale)),
    ]),
  );
}

function draftAmount(value: string) {
  if (!value.trim()) return 0;
  const cents = parseAmountToCents(value);
  return cents !== null && cents >= 0 ? cents : 0;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

/**
 * Amount input that shows the grouped value ("38.850,00") while idle and the
 * raw draft while focused, so editing stays simple.
 */
function AmountInput({
  value,
  onChange,
  displayLocale,
  className,
  ...props
}: {
  value: string;
  onChange: (value: string) => void;
  displayLocale: string;
  className?: string;
  "aria-label": string;
  "aria-invalid"?: boolean;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  let shown = value;
  if (!focused && value.trim()) {
    const cents = parseAmountToCents(value);
    if (cents !== null && cents >= 0) {
      shown =
        cents === 0
          ? ""
          : new Intl.NumberFormat(displayLocale, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }).format(cents / 100);
    }
  }
  return (
    <Input
      {...props}
      className={cn("text-right tabular-nums placeholder:text-muted-foreground/40", className)}
      inputMode="decimal"
      autoComplete="off"
      placeholder="–"
      value={shown}
      onFocus={(event) => {
        setFocused(true);
        const target = event.currentTarget;
        requestAnimationFrame(() => target.select());
      }}
      onBlur={() => setFocused(false)}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function PlanningClient({
  rows,
  year,
  years,
  locale,
}: {
  rows: PlanningRow[];
  year: number;
  years: number[];
  locale: string;
}) {
  const t = useTranslations("accounting");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft>(() => initialDraft(rows, locale));
  const [invalidCells, setInvalidCells] = useState<Set<string>>(new Set());
  const [showEmpty, setShowEmpty] = useState(false);
  const [mobileMonth, setMobileMonth] = useState(() => {
    const now = new Date();
    return now.getFullYear() === year ? now.getMonth() : 0;
  });
  const displayLocale = DISPLAY_LOCALES[locale] ?? locale;

  const monthNames = useMemo(
    () =>
      Array.from({ length: 12 }, (_, month) =>
        new Intl.DateTimeFormat(locale, { month: "short" }).format(
          new Date(2024, month, 1),
        ),
      ),
    [locale],
  );
  const longMonthNames = useMemo(
    () =>
      Array.from({ length: 12 }, (_, month) =>
        new Intl.DateTimeFormat(locale, { month: "long" }).format(
          new Date(2024, month, 1),
        ),
      ),
    [locale],
  );

  /** Categories without any plan or actual on load are collapsed by default. */
  const initiallyEmpty = useMemo(
    () =>
      new Set(
        rows
          .filter(
            (row) =>
              row.plannedByMonth.every((value) => value === 0) &&
              row.actualByMonth.every((value) => value === 0),
          )
          .map((row) => row.categoryId),
      ),
    [rows],
  );

  const plannedByRow = useMemo(() => {
    const result: Record<string, number[]> = {};
    for (const row of rows) {
      result[row.categoryId] = (draft[row.categoryId] ?? []).map(draftAmount);
    }
    return result;
  }, [draft, rows]);

  const sections = useMemo(() => {
    return Object.fromEntries(
      KINDS.map((kind) => {
        const kindRows = rows.filter((row) => row.kind === kind);
        const plannedByMonth = Array.from({ length: 12 }, (_, month) =>
          sum(kindRows.map((row) => plannedByRow[row.categoryId]?.[month] ?? 0)),
        );
        const actualByMonth = Array.from({ length: 12 }, (_, month) =>
          sum(kindRows.map((row) => row.actualByMonth[month] ?? 0)),
        );
        return [
          kind,
          {
            rows: kindRows,
            plannedByMonth,
            actualByMonth,
            planned: sum(plannedByMonth),
            actual: sum(actualByMonth),
          },
        ];
      }),
    ) as Record<
      Kind,
      {
        rows: PlanningRow[];
        plannedByMonth: number[];
        actualByMonth: number[];
        planned: number;
        actual: number;
      }
    >;
  }, [plannedByRow, rows]);

  const totals = {
    plannedIncome: sections.income.planned,
    plannedExpense: sections.expense.planned,
    actualIncome: sections.income.actual,
    actualExpense: sections.expense.actual,
  };

  function isVisible(row: PlanningRow) {
    if (showEmpty || !initiallyEmpty.has(row.categoryId)) return true;
    // Keep rows the user started filling in or that have validation errors.
    return (
      (plannedByRow[row.categoryId] ?? []).some((value) => value !== 0) ||
      [...invalidCells].some((key) => key.startsWith(`${row.categoryId}-`))
    );
  }
  const hiddenCount = rows.filter((row) => !isVisible(row)).length;
  const hasEmptyRows = initiallyEmpty.size > 0;

  function setAmount(categoryId: string, monthIndex: number, value: string) {
    setDraft((current) => ({
      ...current,
      [categoryId]: current[categoryId].map((amount, index) =>
        index === monthIndex ? value : amount,
      ),
    }));
    const key = `${categoryId}-${monthIndex}`;
    setInvalidCells((current) => {
      if (!current.has(key)) return current;
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  }

  function submit() {
    const amounts: PlanningInput["amounts"] = [];
    const invalid = new Set<string>();
    for (const row of rows) {
      (draft[row.categoryId] ?? []).forEach((value, monthIndex) => {
        const parsed = value.trim() ? parseAmountToCents(value) : 0;
        if (parsed === null || parsed < 0 || parsed > 100_000_000_000) {
          invalid.add(`${row.categoryId}-${monthIndex}`);
          return;
        }
        amounts.push({
          categoryId: row.categoryId,
          month: monthIndex + 1,
          amountCents: parsed,
        });
      });
    }
    setInvalidCells(invalid);
    if (invalid.size > 0) {
      toast.error(t("planningInvalidAmount"));
      return;
    }

    startTransition(async () => {
      try {
        await savePlanning({ year, amounts });
        toast.success(tCommon("saved"));
      } catch {
        toast.error(tCommon("error"));
      }
    });
  }

  /** Short grouped amount without currency, "–" for zero. */
  function plain(cents: number) {
    if (cents === 0) return "–";
    return new Intl.NumberFormat(displayLocale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  }

  function varianceTone(kind: Kind, planned: number, actual: number) {
    const difference = actual - planned;
    if (difference === 0 || (planned === 0 && actual === 0)) return "text-muted-foreground";
    const favorable = kind === "income" ? difference > 0 : difference < 0;
    return favorable ? "text-green-700 dark:text-green-500" : "text-destructive";
  }

  function sumCell(kind: Kind, planned: number, actual: number, strong = false) {
    return (
      <td
        className={cn(
          "sticky right-0 z-10 border-l px-3 py-1.5 text-right align-middle tabular-nums whitespace-nowrap shadow-[-6px_0_8px_-6px_rgb(0_0_0/0.25)]",
          strong ? "bg-muted" : "bg-card",
        )}
        title={`${t("variance")}: ${formatCents(actual - planned, locale)}`}
      >
        <div className={cn(strong ? "font-semibold" : "font-medium")}>
          {formatCents(planned, locale)}
        </div>
        <div className={cn("text-[11px]", varianceTone(kind, planned, actual))}>
          {t("actual")} {formatCents(actual, locale)}
        </div>
      </td>
    );
  }

  function renderCategory(row: PlanningRow) {
    const planned = sum(plannedByRow[row.categoryId] ?? []);
    const actual = sum(row.actualByMonth);
    return (
      <tr key={row.categoryId} className="border-b transition-colors hover:bg-muted/30">
        <th
          scope="row"
          className="sticky left-0 z-10 min-w-44 max-w-56 border-r bg-card px-3 py-1.5 text-left font-medium"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: row.categoryColor }}
            />
            <span className="truncate" title={row.categoryName}>
              {row.categoryName}
            </span>
            {row.archived && <Badge variant="secondary">{t("archived")}</Badge>}
          </span>
        </th>
        {monthNames.map((monthName, monthIndex) => {
          const key = `${row.categoryId}-${monthIndex}`;
          return (
            <td key={monthName} className="min-w-24 px-1 py-1.5">
              <AmountInput
                aria-label={`${row.categoryName} ${longMonthNames[monthIndex]}`}
                className="h-8 px-2"
                displayLocale={displayLocale}
                value={draft[row.categoryId]?.[monthIndex] ?? ""}
                disabled={pending || row.archived}
                aria-invalid={invalidCells.has(key)}
                onChange={(value) => setAmount(row.categoryId, monthIndex, value)}
              />
            </td>
          );
        })}
        {sumCell(row.kind, planned, actual)}
      </tr>
    );
  }

  function renderSection(kind: Kind) {
    const section = sections[kind];
    if (section.rows.length === 0) return null;
    const label = t(kind === "income" ? "incomePlural" : "expensePlural");
    return (
      <tbody key={kind}>
        <tr className="border-b bg-muted font-semibold">
          <th
            scope="rowgroup"
            className="sticky left-0 z-10 border-r bg-muted px-3 py-2 text-left"
          >
            {label}
          </th>
          {section.plannedByMonth.map((value, month) => (
            <td
              key={month}
              className="px-2 py-2 text-right tabular-nums whitespace-nowrap"
              title={`${t("actual")}: ${formatCents(section.actualByMonth[month], locale)}`}
            >
              {plain(value)}
            </td>
          ))}
          {sumCell(kind, section.planned, section.actual, true)}
        </tr>
        {section.rows.filter(isVisible).map(renderCategory)}
      </tbody>
    );
  }

  const plannedResult = totals.plannedIncome - totals.plannedExpense;
  const actualResult = totals.actualIncome - totals.actualExpense;
  const resultByMonth = Array.from(
    { length: 12 },
    (_, month) =>
      sections.income.plannedByMonth[month] - sections.expense.plannedByMonth[month],
  );

  const emptyToggle = hasEmptyRows ? (
    <Button
      variant="ghost"
      size="sm"
      className="text-muted-foreground"
      onClick={() => setShowEmpty((value) => !value)}
      aria-expanded={showEmpty}
    >
      <ChevronDown className={cn("size-4 transition-transform", showEmpty && "rotate-180")} />
      {showEmpty
        ? t("planningHideEmpty")
        : t("planningShowEmpty", { count: hiddenCount })}
    </Button>
  ) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        className="mb-0"
        title={`${t("planning")} ${year}`}
        description={t("planningDescription")}
        actions={
          <>
            <Select
              value={String(year)}
              onValueChange={(value) => router.push(`/accounting/planning?year=${value}`)}
            >
              <SelectTrigger className="h-9 w-28" aria-label={t("year")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={submit} disabled={pending || rows.length === 0}>
              <Save className="size-4" />
              {pending ? tCommon("loading") : t("savePlanning")}
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          label={t("plannedIncome")}
          value={formatCents(totals.plannedIncome, locale)}
          className="text-green-700 dark:text-green-500"
        />
        <KpiCard label={t("plannedExpenses")} value={formatCents(totals.plannedExpense, locale)} />
        <KpiCard
          label={t("plannedResult")}
          value={formatCents(plannedResult, locale)}
          className={plannedResult < 0 ? "text-destructive" : undefined}
        />
        <KpiCard
          label={t("actualResult")}
          value={formatCents(actualResult, locale)}
          className={actualResult < 0 ? "text-destructive" : undefined}
        />
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent>
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("noPlanningCategories")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Laptop/desktop: full-year grid with sticky category and total columns. */}
          <Card className="hidden gap-0 pb-0 md:flex">
            <CardHeader className="flex flex-row items-center justify-between gap-3 border-b">
              <CardTitle>{t("monthlyPlanning")}</CardTitle>
              {emptyToggle}
            </CardHeader>
            <div className="relative max-w-full overflow-x-auto overscroll-x-contain">
              <table className="w-full border-separate border-spacing-0 text-sm [&_td]:border-b [&_th]:border-b">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th
                      scope="col"
                      className="sticky left-0 z-20 border-r bg-card px-3 py-2 text-left font-medium"
                    >
                      {t("category")}
                    </th>
                    {monthNames.map((month) => (
                      <th key={month} scope="col" className="px-2 py-2 text-right font-medium">
                        {month}
                      </th>
                    ))}
                    <th
                      scope="col"
                      className="sticky right-0 z-20 min-w-36 border-l bg-card px-3 py-2 text-right font-medium shadow-[-6px_0_8px_-6px_rgb(0_0_0/0.25)]"
                    >
                      {t("sum")}
                    </th>
                  </tr>
                </thead>
                {KINDS.map(renderSection)}
                <tfoot>
                  <tr className="font-semibold">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 border-r border-b-0! bg-card px-3 py-2.5 text-left"
                    >
                      {t("planningResult")}
                    </th>
                    {resultByMonth.map((value, month) => (
                      <td
                        key={month}
                        className={cn(
                          "border-b-0! px-2 py-2.5 text-right tabular-nums whitespace-nowrap",
                          value < 0 && "text-destructive",
                        )}
                      >
                        {plain(value)}
                      </td>
                    ))}
                    <td
                      className="sticky right-0 z-10 border-b-0! border-l bg-card px-3 py-2.5 text-right tabular-nums whitespace-nowrap shadow-[-6px_0_8px_-6px_rgb(0_0_0/0.25)]"
                      title={`${t("actualResult")}: ${formatCents(actualResult, locale)}`}
                    >
                      <div className={cn(plannedResult < 0 && "text-destructive")}>
                        {formatCents(plannedResult, locale)}
                      </div>
                      <div
                        className={cn(
                          "text-[11px] font-normal",
                          actualResult < 0 ? "text-destructive" : "text-muted-foreground",
                        )}
                      >
                        {t("actual")} {formatCents(actualResult, locale)}
                      </div>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          {/* Phone: one month at a time, categories listed vertically. */}
          <Card className="gap-0 py-0 md:hidden">
            <div className="flex items-center gap-2 border-b p-3">
              <Button
                variant="outline"
                size="icon"
                aria-label={t("planningPreviousMonth")}
                disabled={mobileMonth === 0}
                onClick={() => setMobileMonth((month) => Math.max(0, month - 1))}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Select
                value={String(mobileMonth)}
                onValueChange={(value) => setMobileMonth(Number(value))}
              >
                <SelectTrigger className="h-9 flex-1" aria-label={t("month")}>
                  <SelectValue>
                    {(value: string | null) =>
                      `${longMonthNames[Number(value ?? 0)] ?? ""} ${year}`
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {longMonthNames.map((name, month) => (
                    <SelectItem key={name} value={String(month)}>
                      {name} {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                aria-label={t("planningNextMonth")}
                disabled={mobileMonth === 11}
                onClick={() => setMobileMonth((month) => Math.min(11, month + 1))}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
            {KINDS.map((kind) => {
              const section = sections[kind];
              if (section.rows.length === 0) return null;
              const planned = section.plannedByMonth[mobileMonth];
              const actual = section.actualByMonth[mobileMonth];
              return (
                <section key={kind} className="border-b last:border-b-0">
                  <div className="flex items-baseline justify-between gap-3 bg-muted/60 px-3 py-2">
                    <h3 className="text-sm font-semibold">
                      {t(kind === "income" ? "incomePlural" : "expensePlural")}
                    </h3>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums">
                        {formatCents(planned, locale)}
                      </p>
                      <p className={cn("text-[11px] tabular-nums", varianceTone(kind, planned, actual))}>
                        {t("actual")} {formatCents(actual, locale)}
                      </p>
                    </div>
                  </div>
                  <ul className="divide-y">
                    {section.rows.filter(isVisible).map((row) => {
                      const key = `${row.categoryId}-${mobileMonth}`;
                      const rowPlanned = plannedByRow[row.categoryId]?.[mobileMonth] ?? 0;
                      const rowActual = row.actualByMonth[mobileMonth] ?? 0;
                      return (
                        <li key={row.categoryId} className="flex items-center gap-3 px-3 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
                              <span
                                className="size-2 shrink-0 rounded-full"
                                style={{ backgroundColor: row.categoryColor }}
                              />
                              <span className="truncate">{row.categoryName}</span>
                            </p>
                            <p
                              className={cn(
                                "mt-0.5 pl-4 text-[11px] tabular-nums",
                                varianceTone(row.kind, rowPlanned, rowActual),
                              )}
                            >
                              {t("actual")} {formatCents(rowActual, locale)}
                            </p>
                          </div>
                          <AmountInput
                            aria-label={`${row.categoryName} ${longMonthNames[mobileMonth]}`}
                            className="h-10 w-32 shrink-0 text-base"
                            displayLocale={displayLocale}
                            value={draft[row.categoryId]?.[mobileMonth] ?? ""}
                            disabled={pending || row.archived}
                            aria-invalid={invalidCells.has(key)}
                            onChange={(value) => setAmount(row.categoryId, mobileMonth, value)}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
            <div className="flex items-center justify-between gap-3 border-t bg-muted/40 px-3 py-2.5">
              <span className="text-sm font-semibold">{t("planningResult")}</span>
              <span
                className={cn(
                  "text-sm font-semibold tabular-nums",
                  resultByMonth[mobileMonth] < 0 && "text-destructive",
                )}
              >
                {formatCents(resultByMonth[mobileMonth], locale)}
              </span>
            </div>
            {emptyToggle ? <div className="border-t p-2">{emptyToggle}</div> : null}
          </Card>
        </>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <Card size="sm" className="min-w-0">
      <CardContent>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p
          className={cn(
            "mt-1.5 truncate text-lg font-semibold tabular-nums sm:text-2xl",
            className,
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
