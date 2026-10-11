"use client";
import { UserIdentity, UserAttribution } from "@/components/user-identity";

import { Fragment, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { BookOpenText, ChevronDown, ChevronRight, Download, Filter, Paperclip, Plus } from "lucide-react";
import { formatCents } from "@/lib/money";
import type { EntryFilters, EntryRow } from "@/modules/accounting/queries";
import type { categories as categoriesTable } from "@/modules/accounting/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip";
import { useKeyboardShortcut } from "@/components/use-keyboard-shortcut";
import { SECTION_PAGE_SHORTCUTS } from "@/lib/app-shortcuts";
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

/** Unfinalised booking marker, styled like the draft invoice status pill (design 1b). */
function DraftPill({ label, className }: { label: string; className?: string }) {
  return (
    <span className={cn("inline-flex h-5 items-center rounded-full bg-muted px-2 text-[11px] font-semibold whitespace-nowrap text-text-secondary", className)}>
      {label}
    </span>
  );
}

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
  function openNewEntry() {
    setDialogEntry(null);
    setDialogOpen(true);
  }
  useKeyboardShortcut(SECTION_PAGE_SHORTCUTS.accounting.newEntry, openNewEntry);

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
      <section className="rounded-xl border bg-card px-[18px] py-3.5 shadow-card">
        <div className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold tracking-[0.12em] text-text-tertiary uppercase">
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
              className="w-full sm:w-28"
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
              className="w-full sm:w-40"
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
              className="w-full sm:w-36"
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
              className="w-full sm:w-56"
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
            >
              <Download className="size-4" />
              {t("exportCsv")}
            </Button>
            <ShortcutTooltip label={t("newEntry")} shortcut={SECTION_PAGE_SHORTCUTS.accounting.newEntry}>
              <Button size="sm" onClick={openNewEntry}>
                <Plus className="size-4" />
                {t("newEntry")}
              </Button>
            </ShortcutTooltip>
          </div>
        </div>
      </section>

      <section
        aria-label={tBookings("periodTotals")}
        className="grid grid-cols-1 overflow-hidden rounded-xl border bg-card shadow-card sm:grid-cols-3"
      >
        {[
          { key: "income", label: t("incomePlural"), value: totals.incomeGross },
          { key: "expense", label: t("expensePlural"), value: totals.expenseGross === 0 ? 0 : -totals.expenseGross },
          { key: "balance", label: t("balance"), value: totals.balance },
        ].map((tile) => (
          <div
            key={tile.key}
            className="flex min-w-0 items-baseline justify-between gap-3 px-[18px] py-2.5 shadow-[1px_0_0_var(--border),0_1px_0_var(--border)] sm:block sm:py-4"
          >
            <p className="truncate text-[11px] font-semibold tracking-[0.12em] text-text-tertiary uppercase">
              {tile.label}
            </p>
            <p
              className={cn(
                "text-sm font-semibold tracking-[-0.02em] whitespace-nowrap tabular-nums sm:mt-2 sm:text-[22px] sm:leading-tight",
                tile.key === "balance" && tile.value < 0 && "text-late",
              )}
            >
              {formatCents(tile.value, locale)}
            </p>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-3 md:hidden" aria-label={tBookings("title")}>
        {entries.length === 0 ? (
          <div className="rounded-xl border bg-card shadow-card"><EmptyState compact icon={<BookOpenText />} title={t("noEntries")} /></div>
        ) : entries.map((entry) => {
          const sign = entry.kind === "expense" ? -1 : 1;
          const canEdit = canManagePersonnel || entry.categoryTemplate !== "personnel";
          return (
            <button
              key={entry.id}
              type="button"
              disabled={!canEdit}
              className="w-full min-w-0 rounded-xl border bg-card p-4 text-left shadow-card transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-75 disabled:hover:bg-card"
              onClick={() => {
                if (!canEdit) return;
                setDialogEntry(entry);
                setDialogOpen(true);
              }}
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[13.5px] font-semibold break-words">{entry.description}</p>
                  {entry.counterparty ? (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{entry.counterparty}</p>
                  ) : null}
                </div>
                <p className="shrink-0 font-semibold whitespace-nowrap tabular-nums">
                  {formatCents(sign * entry.grossAmountCents, locale)}
                </p>
              </div>
              <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 border-t border-line-soft pt-3">
                <span className="text-xs text-muted-foreground tabular-nums">{bookingDate(entry.date)}</span>
                <Badge variant="outline" className="max-w-full min-w-0 rounded-full text-[11px] text-text-secondary">
                  <span className="mr-1 inline-block size-2 shrink-0 rounded-full" style={{ backgroundColor: entry.categoryColor }} />
                  <span className="truncate">{entry.categoryName}</span>
                </Badge>
                {entry.status === "draft" ? <DraftPill label={tBookings("draft")} /> : null}
                {entry.attachmentCount > 0 ? <Paperclip className="ml-auto size-4 shrink-0 text-muted-foreground" /> : null}
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

      <section className="hidden overflow-hidden rounded-xl border bg-card shadow-card md:block">
        <Table className="text-[13.5px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-9 w-28 pl-[18px] text-[11.5px] font-medium text-muted-foreground">
                {t("date")}
              </TableHead>
              <TableHead className="h-9 text-[11.5px] font-medium text-muted-foreground">
                {t("description")}
              </TableHead>
              <TableHead className="hidden h-9 text-[11.5px] font-medium text-muted-foreground md:table-cell">
                {t("counterparty")}
              </TableHead>
              <TableHead className="h-9 text-[11.5px] font-medium text-muted-foreground">
                {t("category")}
              </TableHead>
              <TableHead className="hidden h-9 text-right text-[11.5px] font-medium text-muted-foreground lg:table-cell">
                {t("net")}
              </TableHead>
              <TableHead className="hidden h-9 text-right text-[11.5px] font-medium text-muted-foreground xl:table-cell">
                {t("vat")}
              </TableHead>
              <TableHead className="h-9 pr-[18px] text-right text-[11.5px] font-medium text-muted-foreground">
                {t("gross")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="whitespace-normal">
                  <EmptyState icon={<BookOpenText />} title={t("noEntries")} />
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
                  <TableCell className="pl-[18px] whitespace-nowrap text-muted-foreground tabular-nums">
                    {bookingDate(entry.date)}
                  </TableCell>
                  <TableCell className="max-w-72">
                    <span className="flex items-center gap-2">
                      <button
                        type="button"
                        className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
                        <span className="block truncate font-medium">
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
                        <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="hidden max-w-48 truncate text-muted-foreground md:table-cell">
                    {entry.counterparty}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="rounded-full text-[11px] text-text-secondary">
                      <span
                        className="mr-1 inline-block size-2 rounded-full"
                        style={{ backgroundColor: entry.categoryColor }}
                      />
                      {entry.categoryName}
                    </Badge>
                    {entry.status === "draft" && (
                      <DraftPill className="ml-1" label={tBookings("draft")} />
                    )}
                  </TableCell>
                  <TableCell className="hidden text-right text-text-secondary tabular-nums lg:table-cell">
                    {formatCents(sign * entry.netAmountCents, locale)}
                  </TableCell>
                  <TableCell className="hidden text-right text-muted-foreground tabular-nums xl:table-cell">
                    {formatCents(sign * entry.vatAmountCents, locale)}
                  </TableCell>
                  <TableCell className="pr-[18px] text-right font-semibold tabular-nums">
                    {formatCents(sign * entry.grossAmountCents, locale)}
                  </TableCell>
                </TableRow>
                {expandedId === entry.id && (
                  <TableRow className="border-line-soft bg-surface-raised hover:bg-surface-raised">
                    <TableCell colSpan={7} className="px-[18px] py-4">
                      <div className="grid gap-4 text-xs sm:grid-cols-[220px_1fr]">
                        <div className="space-y-1 text-muted-foreground">
                          <p><strong className="font-semibold text-foreground">{tBookings("documentDate")}:</strong> {entry.documentDate ?? "–"}</p>
                          <p><strong className="font-semibold text-foreground">{tBookings("documentNumber")}:</strong> {entry.documentNumber || "–"}</p>
                          <p><strong className="font-semibold text-foreground">{tBookings("deductible")}:</strong> {entry.deductiblePercent} %</p>
                          <UserAttribution userId={entry.createdBy} relation="createdBy" className="pt-1" />
                        </div>
                        <div className="space-y-2">
                        <div className="overflow-hidden rounded-lg border bg-card">
                          {entry.taxLines.map((line, index) => (
                            <div key={line.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 border-b border-line-soft px-3 py-2 last:border-b-0">
                              <span className="truncate text-text-secondary">{line.description || `${tBookings("taxLine")} ${index + 1}`}</span>
                              <span>{line.vatRate} %</span>
                              <span className="tabular-nums">{formatCents(line.netAmountCents, locale)}</span>
                              <strong className="font-semibold tabular-nums">{formatCents(line.grossAmountCents, locale)}</strong>
                            </div>
                          ))}
                        </div>
                        {entry.paymentLines.length > 0 && (
                          <div className="overflow-hidden rounded-lg border bg-card">
                            <div className="border-b border-line-soft bg-muted px-3 py-2 text-[11px] font-semibold tracking-[0.1em] text-text-tertiary uppercase">{tBookings("payments")}</div>
                            {entry.paymentLines.map((line) => (
                              <div key={line.id} className="grid grid-cols-[auto_1fr_auto] gap-3 border-b border-line-soft px-3 py-2 last:border-b-0">
                                <span className="whitespace-nowrap text-muted-foreground tabular-nums">{line.date}</span>
                                <span className="truncate text-text-secondary">{line.description}{line.recipient ? ` · ${line.recipient}` : ""}</span>
                                <strong className="font-semibold tabular-nums">{formatCents(line.amountCents, locale)}</strong>
                              </div>
                            ))}
                          </div>
                        )}
                        {entry.auditHistory.length > 0 && (
                          <div className="overflow-hidden rounded-lg border bg-card">
                            <div className="border-b border-line-soft bg-muted px-3 py-2 text-[11px] font-semibold tracking-[0.1em] text-text-tertiary uppercase">{tBookings("auditHistory")}</div>
                            {entry.auditHistory.map((item) => (
                              <div key={item.id} className="grid gap-1 border-b border-line-soft px-3 py-2 last:border-b-0 sm:grid-cols-[auto_1fr]">
                                <span className="whitespace-nowrap text-muted-foreground tabular-nums">{format.dateTime(item.changedAt, { dateStyle: "medium", timeStyle: "short" })}</span>
                                <span className="text-text-secondary">{tBookings(`auditActions.${item.action}`)} · <UserIdentity userId={item.changedBy} name={item.changedByName} compact />{item.reason ? ` — ${item.reason}` : ""}</span>
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
