"use client";
import { UserIdentity, UserAttribution } from "@/components/user-identity";

import { Fragment, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, Download, Filter, Paperclip, Plus } from "lucide-react";
import { formatCents } from "@/lib/money";
import type { EntryFilters, EntryRow } from "@/modules/accounting/queries";
import type { categories as categoriesTable } from "@/modules/accounting/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export function LedgerClient({
  entries,
  nextCursor,
  totals,
  categories,
  years,
  filters,
  canManagePersonnel,
  taxSettings,
  fundingProjects,
  personnelEmployees,
  personnelLocations,
  payrollMonthContexts,
}: {
  entries: EntryRow[];
  nextCursor: string | null;
  totals: { incomeGross: number; expenseGross: number; balance: number };
  categories: Category[];
  years: number[];
  filters: EntryFilters;
  canManagePersonnel: boolean;
  taxSettings: { kleinunternehmer: boolean; defaultVatRate: number };
  fundingProjects: Array<{ id: string; name: string }>;
  personnelEmployees: Array<{ id: string; name: string; userId: string | null; personnelNumber: string; employmentType: string; locationId: string | null }>;
  personnelLocations: Array<{ id: string; name: string; state: string; municipality: string }>;
  payrollMonthContexts: Array<{ payrollMonth: string; internalPayrollCents: number; externalPayrollCents: number; externalMarginalPayrollCents: number; marginalPayrollCents: number }>;
}) {
  const t = useTranslations("accounting");
  const tBookings = useTranslations("accountingBookings");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const format = useFormatter();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dialogEntry, setDialogEntry] = useState<EntryRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function setParam(key: string, value: string | null | undefined) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("cursor");
    router.push(`/accounting/bookings?${params.toString()}`);
  }

  function monthName(month: number) {
    return format.dateTime(new Date(Date.UTC(filters.year, month - 1, 1)), {
      month: "long",
      timeZone: "UTC",
    });
  }

  // Booking dates are plain YYYY-MM-DD strings; format them in UTC so the
  // calendar day never shifts with the viewer's timezone.
  function bookingDate(date: string) {
    return format.dateTime(new Date(`${date}T00:00:00Z`), {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  const exportHref = filters.month
    ? `/api/accounting/export?year=${filters.year}&month=${filters.month}`
    : `/api/accounting/export?year=${filters.year}`;

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border border-[#dfe5e1] dark:border-border bg-white dark:bg-card p-4 shadow-[0_1px_2px_rgba(20,47,39,0.03)] sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-[0.08em] text-[#71807a] dark:text-muted-foreground uppercase">
          <Filter className="size-3.5" />
          {tBookings("filters")}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <Select
            value={String(filters.year)}
            onValueChange={(value) => setParam("year", value)}
          >
            <SelectTrigger
              aria-label={t("year")}
              className="w-full border-[#d4ddd8] sm:w-28 dark:border-border bg-[#fbfcfb] dark:bg-muted"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((year) => (
                <SelectItem key={year} value={String(year)}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.month ? String(filters.month) : "all"}
            onValueChange={(value) =>
              setParam("month", value === "all" ? undefined : value)
            }
          >
            <SelectTrigger
              aria-label={t("month")}
              className="w-full border-[#d4ddd8] sm:w-40 dark:border-border bg-[#fbfcfb] dark:bg-muted"
            >
              <SelectValue>
                {filters.month ? monthName(filters.month) : t("wholeYear")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("wholeYear")}</SelectItem>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                <SelectItem key={month} value={String(month)}>
                  {monthName(month)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.kind ?? "all"}
            onValueChange={(value) =>
              setParam("kind", value === "all" ? undefined : value)
            }
          >
            <SelectTrigger
              aria-label={tBookings("type")}
              className="w-full border-[#d4ddd8] sm:w-36 dark:border-border bg-[#fbfcfb] dark:bg-muted"
            >
              <SelectValue>
                {filters.kind
                  ? t(filters.kind === "income" ? "incomePlural" : "expensePlural")
                  : tBookings("allKinds")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tBookings("allKinds")}</SelectItem>
              <SelectItem value="income">{t("incomePlural")}</SelectItem>
              <SelectItem value="expense">{t("expensePlural")}</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filters.categoryId ?? "all"}
            onValueChange={(value) =>
              setParam("category", value === "all" ? undefined : value)
            }
          >
            <SelectTrigger
              aria-label={t("category")}
              className="w-full border-[#d4ddd8] sm:w-56 dark:border-border bg-[#fbfcfb] dark:bg-muted"
            >
              <SelectValue>
                {filters.categoryId
                  ? (categories.find((category) => category.id === filters.categoryId)
                      ?.name ?? "")
                  : t("allCategories")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allCategories")}</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="col-span-2 flex flex-wrap items-center justify-end gap-2 sm:ml-auto">
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<a href={exportHref} />}
              className="border-[#d4ddd8] dark:border-border bg-white dark:bg-card text-[#315c73] dark:text-foreground hover:bg-[#edf2f0] dark:hover:bg-accent hover:text-[#234758] dark:hover:text-foreground"
            >
              <Download className="size-4" />
              {t("exportCsv")}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setDialogEntry(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="size-4" />
              {t("newEntry")}
            </Button>
          </div>
        </div>
      </section>

      <section
        aria-label={tBookings("periodTotals")}
        className="grid grid-cols-1 overflow-hidden rounded-2xl sm:grid-cols-3 border border-[#dfe5e1] dark:border-border bg-white dark:bg-card shadow-[0_1px_2px_rgba(20,47,39,0.03)]"
      >
        <div className="flex min-w-0 items-baseline justify-between gap-3 px-4 py-2.5 sm:block sm:p-5">
          <p className="truncate text-[11px] font-semibold tracking-[0.06em] text-[#7b8883] dark:text-muted-foreground uppercase sm:tracking-[0.08em]">
            {t("incomePlural")}
          </p>
          <p className="text-sm font-semibold whitespace-nowrap tabular-nums text-[#2f6b55] dark:text-emerald-400 sm:mt-2 sm:text-lg">
            {formatCents(totals.incomeGross, locale)}
          </p>
        </div>
        <div className="flex min-w-0 items-baseline justify-between gap-3 border-t border-[#e3e8e5] dark:border-border px-4 py-2.5 sm:block sm:border-t-0 sm:border-l sm:p-5">
          <p className="truncate text-[11px] font-semibold tracking-[0.06em] text-[#7b8883] dark:text-muted-foreground uppercase sm:tracking-[0.08em]">
            {t("expensePlural")}
          </p>
          <p className="text-sm font-semibold whitespace-nowrap tabular-nums text-[#273f38] dark:text-foreground sm:mt-2 sm:text-lg">
            {formatCents(
              totals.expenseGross === 0 ? 0 : -totals.expenseGross,
              locale,
            )}
          </p>
        </div>
        <div className="flex min-w-0 items-baseline justify-between gap-3 border-t border-[#e3e8e5] dark:border-border bg-[#f8faf8] dark:bg-muted px-4 py-2.5 sm:block sm:border-t-0 sm:border-l sm:p-5">
          <p className="truncate text-[11px] font-semibold tracking-[0.06em] text-[#7b8883] dark:text-muted-foreground uppercase sm:tracking-[0.08em]">
            {t("balance")}
          </p>
          <p
            className={`text-sm font-semibold whitespace-nowrap tabular-nums sm:mt-2 sm:text-lg ${
              totals.balance >= 0 ? "text-[#2f6b55] dark:text-emerald-400" : "text-[#a64f3c] dark:text-red-400"
            }`}
          >
            {formatCents(totals.balance, locale)}
          </p>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 md:hidden" aria-label={tBookings("title")}>
        {entries.length === 0 ? (
          <div className="rounded-2xl border border-[#dfe5e1] dark:border-border bg-white dark:bg-card p-8 text-center text-sm text-[#7a8782] dark:text-muted-foreground">{t("noEntries")}</div>
        ) : entries.map((entry) => {
          const sign = entry.kind === "expense" ? -1 : 1;
          const canEdit = canManagePersonnel || entry.categoryTemplate !== "personnel";
          return (
            <button
              key={entry.id}
              type="button"
              disabled={!canEdit}
              className="w-full min-w-0 rounded-2xl border border-[#dfe5e1] dark:border-border bg-white dark:bg-card p-4 text-left shadow-[0_1px_2px_rgba(20,47,39,0.03)] transition hover:border-[#b9cac2] dark:hover:border-border disabled:cursor-default disabled:opacity-75"
              onClick={() => {
                if (!canEdit) return;
                setDialogEntry(entry);
                setDialogOpen(true);
              }}
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 font-semibold break-words text-[#213c35] dark:text-foreground">{entry.description}</p>
                  {entry.counterparty ? (
                    <p className="mt-0.5 truncate text-xs text-[#71807a] dark:text-muted-foreground">{entry.counterparty}</p>
                  ) : null}
                </div>
                <p className={`shrink-0 font-semibold whitespace-nowrap tabular-nums ${entry.kind === "income" ? "text-[#2f6b55] dark:text-emerald-400" : "text-[#273f38] dark:text-foreground"}`}>
                  {formatCents(sign * entry.grossAmountCents, locale)}
                </p>
              </div>
              <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 border-t border-[#edf0ee] dark:border-border pt-3">
                <span className="text-xs tabular-nums text-[#68756f] dark:text-muted-foreground">{bookingDate(entry.date)}</span>
                <Badge variant="outline" className="max-w-full min-w-0 border-[#dfe5e1] dark:border-border bg-[#fafbfa] dark:bg-muted text-[#52625c] dark:text-muted-foreground">
                  <span className="mr-1 inline-block size-2 shrink-0 rounded-full" style={{ backgroundColor: entry.categoryColor }} />
                  <span className="truncate">{entry.categoryName}</span>
                </Badge>
                {entry.status === "draft" ? <Badge className="bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" variant="outline">{tBookings("draft")}</Badge> : null}
                {entry.attachmentCount > 0 ? <Paperclip className="ml-auto size-4 shrink-0 text-[#83918b] dark:text-muted-foreground" /> : null}
                {entry.createdBy ? (
                  <UserAttribution
                    userId={entry.createdBy}
                    relation="createdBy"
                    className="w-full min-w-0 flex-nowrap text-[11px] [&>span:last-child]:min-w-0"
                  />
                ) : null}
              </div>
            </button>
          );
        })}
      </section>

      <section className="hidden overflow-hidden rounded-2xl border border-[#dfe5e1] dark:border-border bg-white dark:bg-card shadow-[0_1px_2px_rgba(20,47,39,0.03)] md:block">
        <Table>
          <TableHeader className="bg-[#f8faf8] dark:bg-muted">
            <TableRow className="border-[#e3e8e5] dark:border-border hover:bg-transparent">
              <TableHead className="h-10 w-28 pl-5 text-[11px] font-semibold tracking-[0.08em] text-[#7b8883] dark:text-muted-foreground uppercase sm:pl-6">
                {t("date")}
              </TableHead>
              <TableHead className="h-10 text-[11px] font-semibold tracking-[0.08em] text-[#7b8883] dark:text-muted-foreground uppercase">
                {t("description")}
              </TableHead>
              <TableHead className="hidden h-10 text-[11px] font-semibold tracking-[0.08em] text-[#7b8883] dark:text-muted-foreground uppercase md:table-cell">
                {t("counterparty")}
              </TableHead>
              <TableHead className="h-10 text-[11px] font-semibold tracking-[0.08em] text-[#7b8883] dark:text-muted-foreground uppercase">
                {t("category")}
              </TableHead>
              <TableHead className="hidden h-10 text-right text-[11px] font-semibold tracking-[0.08em] text-[#7b8883] dark:text-muted-foreground uppercase lg:table-cell">
                {t("net")}
              </TableHead>
              <TableHead className="hidden h-10 text-right text-[11px] font-semibold tracking-[0.08em] text-[#7b8883] dark:text-muted-foreground uppercase xl:table-cell">
                {t("vat")}
              </TableHead>
              <TableHead className="h-10 pr-5 text-right text-[11px] font-semibold tracking-[0.08em] text-[#7b8883] dark:text-muted-foreground uppercase sm:pr-6">
                {t("gross")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-40 text-center text-[#7a8782] dark:text-muted-foreground">
                  {t("noEntries")}
                </TableCell>
              </TableRow>
            )}
            {entries.map((entry) => {
              const sign = entry.kind === "expense" ? -1 : 1;
              const canEdit =
                canManagePersonnel || entry.categoryTemplate !== "personnel";
              return (
                <Fragment key={entry.id}>
                <TableRow
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
                    if (
                      event.target !== event.currentTarget ||
                      !canEdit ||
                      (event.key !== "Enter" && event.key !== " ")
                    ) {
                      return;
                    }
                    event.preventDefault();
                    setDialogEntry(entry);
                    setDialogOpen(true);
                  }}
                >
                  <TableCell className="whitespace-nowrap pl-5 text-[#68756f] dark:text-muted-foreground sm:pl-6">
                    {bookingDate(entry.date)}
                  </TableCell>
                  <TableCell className="max-w-72">
                    <span className="flex items-center gap-2">
                      <button
                        type="button"
                        className="flex size-6 shrink-0 items-center justify-center rounded-md text-[#788680] dark:text-muted-foreground hover:bg-[#e8efeb] dark:hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315c73] dark:focus-visible:ring-ring"
                        aria-label={tBookings("toggleDetails")}
                        aria-expanded={expandedId === entry.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          setExpandedId((current) => current === entry.id ? null : entry.id);
                        }}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        {expandedId === entry.id ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                      </button>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-[#213c35] dark:text-foreground">
                          {entry.description}
                        </span>
                        {entry.createdBy ? (
                          <UserAttribution
                            userId={entry.createdBy}
                            relation="createdBy"
                            className="mt-0.5 flex-nowrap text-[11px] [&>span:last-child]:min-w-0"
                          />
                        ) : null}
                      </span>
                      {entry.attachmentCount > 0 && (
                        <Paperclip className="size-3.5 shrink-0 text-[#83918b] dark:text-muted-foreground" />
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="hidden max-w-48 truncate text-[#71807a] dark:text-muted-foreground md:table-cell">
                    {entry.counterparty}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="border-[#dfe5e1] dark:border-border bg-[#fafbfa] dark:bg-muted text-[#52625c] dark:text-muted-foreground"
                    >
                      <span
                        className="mr-1 inline-block size-2 rounded-full"
                        style={{ backgroundColor: entry.categoryColor }}
                      />
                      {entry.categoryName}
                    </Badge>
                    {entry.status === "draft" && (
                      <Badge className="ml-1 bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" variant="outline">
                        {tBookings("draft")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums text-[#5c6b66] dark:text-muted-foreground lg:table-cell">
                    {formatCents(sign * entry.netAmountCents, locale)}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums text-[#87938f] dark:text-muted-foreground xl:table-cell">
                    {formatCents(sign * entry.vatAmountCents, locale)}
                  </TableCell>
                  <TableCell
                    className={`pr-5 text-right font-semibold tabular-nums sm:pr-6 ${
                      entry.kind === "income" ? "text-[#2f6b55] dark:text-emerald-400" : "text-[#273f38] dark:text-foreground"
                    }`}
                  >
                    {formatCents(sign * entry.grossAmountCents, locale)}
                  </TableCell>
                </TableRow>
                {expandedId === entry.id && (
                  <TableRow className="border-[#e4eae7] dark:border-border bg-[#f8faf8] dark:bg-muted hover:bg-[#f8faf8] dark:hover:bg-accent">
                    <TableCell colSpan={7} className="px-5 py-4 sm:px-6">
                      <div className="grid gap-4 text-xs sm:grid-cols-[220px_1fr]">
                        <div className="space-y-1 text-[#66756f] dark:text-muted-foreground">
                          <p><strong className="text-[#2b473f] dark:text-foreground">{tBookings("documentDate")}:</strong> {entry.documentDate ?? "–"}</p>
                          <p><strong className="text-[#2b473f] dark:text-foreground">{tBookings("documentNumber")}:</strong> {entry.documentNumber || "–"}</p>
                          <p><strong className="text-[#2b473f] dark:text-foreground">{tBookings("deductible")}:</strong> {entry.deductiblePercent} %</p>
                          <UserAttribution userId={entry.createdBy} relation="createdBy" className="pt-1" />
                        </div>
                        <div className="space-y-2">
                        <div className="overflow-hidden rounded-lg border border-[#dfe5e1] dark:border-border bg-white dark:bg-card">
                          {entry.taxLines.map((line, index) => (
                            <div key={line.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 border-b border-[#edf0ee] dark:border-border px-3 py-2 last:border-b-0">
                              <span className="truncate text-[#52635d] dark:text-muted-foreground">{line.description || `${tBookings("taxLine")} ${index + 1}`}</span>
                              <span>{line.vatRate} %</span>
                              <span className="tabular-nums">{formatCents(line.netAmountCents, locale)}</span>
                              <strong className="tabular-nums text-[#29463e] dark:text-foreground">{formatCents(line.grossAmountCents, locale)}</strong>
                            </div>
                          ))}
                        </div>
                        {entry.paymentLines.length > 0 && (
                          <div className="overflow-hidden rounded-lg border border-[#dfe5e1] dark:border-border bg-white dark:bg-card">
                            <div className="bg-[#f1f5f2] dark:bg-muted px-3 py-2 font-semibold text-[#38554c] dark:text-foreground">{tBookings("payments")}</div>
                            {entry.paymentLines.map((line) => (
                              <div key={line.id} className="grid grid-cols-[auto_1fr_auto] gap-3 border-b border-[#edf0ee] dark:border-border px-3 py-2 last:border-b-0">
                                <span className="whitespace-nowrap text-[#71807a] dark:text-muted-foreground">{line.date}</span>
                                <span className="truncate text-[#52635d] dark:text-muted-foreground">{line.description}{line.recipient ? ` · ${line.recipient}` : ""}</span>
                                <strong className="tabular-nums text-[#29463e] dark:text-foreground">{formatCents(line.amountCents, locale)}</strong>
                              </div>
                            ))}
                          </div>
                        )}
                        {entry.auditHistory.length > 0 && (
                          <div className="overflow-hidden rounded-lg border border-[#dfe5e1] dark:border-border bg-white dark:bg-card">
                            <div className="bg-[#f1f5f2] dark:bg-muted px-3 py-2 font-semibold text-[#38554c] dark:text-foreground">{tBookings("auditHistory")}</div>
                            {entry.auditHistory.map((item) => (
                              <div key={item.id} className="grid gap-1 border-b border-[#edf0ee] dark:border-border px-3 py-2 last:border-b-0 sm:grid-cols-[auto_1fr]">
                                <span className="whitespace-nowrap text-[#71807a] dark:text-muted-foreground">{format.dateTime(item.changedAt, { dateStyle: "medium", timeStyle: "short" })}</span>
                                <span className="text-[#52635d] dark:text-muted-foreground">{tBookings(`auditActions.${item.action}`)} · <UserIdentity userId={item.changedBy} name={item.changedByName} compact />{item.reason ? ` — ${item.reason}` : ""}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </section>

      {nextCursor && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            nativeButton={false}
            render={
              <Link
                href={`/accounting/bookings?${new URLSearchParams({
                  ...Object.fromEntries(searchParams.entries()),
                  cursor: nextCursor,
                }).toString()}`}
              />
            }
          >
            {tCommon("nextPage")}
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}

      {dialogOpen && <EntryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
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
