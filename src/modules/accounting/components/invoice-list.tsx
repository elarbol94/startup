"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { FileText, Plus, Search, X } from "lucide-react";
import { UserAttribution } from "@/components/user-identity";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InvoiceStatusBadge } from "./invoice-status-badge";
import { ProjectChip, ProjectDot } from "@/modules/projects/components/project-chip";

export type InvoiceListItem = {
  id: string;
  invoiceNumber: string;
  customerName: string;
  dueDate: string | null;
  status: string;
  grossCents: number;
  createdBy: string | null;
  projects?: { id: string; name: string; color: string; archived: boolean }[];
};

export const INVOICE_STATUS_FILTERS = [
  "all",
  "draft",
  "sent",
  "overdue",
  "paid",
  "canceled",
] as const;
export type InvoiceStatusFilter = (typeof INVOICE_STATUS_FILTERS)[number];

function parseStatusFilter(value: string | null): InvoiceStatusFilter {
  return INVOICE_STATUS_FILTERS.includes(value as InvoiceStatusFilter)
    ? (value as InvoiceStatusFilter)
    : "all";
}

/** Sent but unpaid invoices whose due date lies before today (same rule as the KPI). */
export function isInvoiceOverdue(
  invoice: Pick<InvoiceListItem, "status" | "dueDate">,
  today: string,
) {
  return invoice.status === "sent" && !!invoice.dueDate && invoice.dueDate < today;
}

/** Updates `?status=` without a server round trip; the list reads it via useSearchParams. */
export function setInvoiceStatusParam(status: InvoiceStatusFilter) {
  const params = new URLSearchParams(window.location.search);
  if (status === "all") params.delete("status");
  else params.set("status", status);
  const query = params.toString();
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
  );
}

/** KPI tile that applies the overdue filter to the invoice list below. */
export function OverdueFilterTile({
  count,
  label,
  hint,
}: {
  count: number;
  label: string;
  hint: string;
}) {
  const content = (
    <>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-2 text-2xl font-semibold tabular-nums",
          count > 0 && "text-destructive",
        )}
      >
        {count}
      </p>
      {count > 0 ? (
        <p className="mt-1 text-xs text-muted-foreground group-hover:text-foreground">
          {hint}
        </p>
      ) : null}
    </>
  );
  if (count === 0) return <div className="p-4">{content}</div>;
  return (
    <a
      href="?status=overdue#invoices"
      className="group block p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2"
      onClick={(event) => {
        event.preventDefault();
        setInvoiceStatusParam("overdue");
        document
          .getElementById("invoices")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
    >
      {content}
    </a>
  );
}

export function InvoiceList({
  invoices,
  today,
}: {
  invoices: InvoiceListItem[];
  today: string;
}) {
  const t = useTranslations("documents");
  const tInvoices = useTranslations("invoices");
  const locale = useLocale();
  const format = useFormatter();
  const searchParams = useSearchParams();
  const status = parseStatusFilter(searchParams.get("status"));
  const [query, setQuery] = useState("");
  const filterBarRef = useRef<HTMLDivElement>(null);

  // Keep the active chip visible in the horizontally scrolling filter bar.
  useEffect(() => {
    const bar = filterBarRef.current;
    const active = bar?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!bar || !active) return;
    const offset =
      active.getBoundingClientRect().left - bar.getBoundingClientRect().left + bar.scrollLeft;
    if (offset < bar.scrollLeft || offset + active.offsetWidth > bar.scrollLeft + bar.clientWidth) {
      bar.scrollTo({ left: Math.max(0, offset - 12), behavior: "smooth" });
    }
  }, [status]);

  const counts = useMemo(() => {
    const result: Record<InvoiceStatusFilter, number> = {
      all: invoices.length,
      draft: 0,
      sent: 0,
      overdue: 0,
      paid: 0,
      canceled: 0,
    };
    for (const invoice of invoices) {
      if (invoice.status in result) {
        result[invoice.status as InvoiceStatusFilter] += 1;
      }
      if (isInvoiceOverdue(invoice, today)) result.overdue += 1;
    }
    return result;
  }, [invoices, today]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(locale);
    return invoices.filter((invoice) => {
      if (status === "overdue" && !isInvoiceOverdue(invoice, today)) return false;
      if (status !== "all" && status !== "overdue" && invoice.status !== status) {
        return false;
      }
      if (!needle) return true;
      return (
        invoice.invoiceNumber.toLocaleLowerCase(locale).includes(needle) ||
        invoice.customerName.toLocaleLowerCase(locale).includes(needle)
      );
    });
  }, [invoices, locale, query, status, today]);

  const filterLabels: Record<InvoiceStatusFilter, string> = {
    all: t("filterAll"),
    draft: tInvoices("statusDraft"),
    sent: tInvoices("statusSent"),
    overdue: t("overdue"),
    paid: tInvoices("statusPaid"),
    canceled: tInvoices("statusCanceled"),
  };

  function formatDate(value: string) {
    return format.dateTime(new Date(value), {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  function statusBadge(invoice: InvoiceListItem) {
    if (isInvoiceOverdue(invoice, today)) {
      return (
        <Badge variant="destructive" title={tInvoices("statusSent")}>
          {t("overdue")}
        </Badge>
      );
    }
    return <InvoiceStatusBadge status={invoice.status} />;
  }

  function dueDate(invoice: InvoiceListItem) {
    if (!invoice.dueDate) return "–";
    const overdue = isInvoiceOverdue(invoice, today);
    return (
      <span className={cn(overdue && "font-medium text-destructive")}>
        {formatDate(invoice.dueDate)}
      </span>
    );
  }

  const filtersActive = status !== "all" || query.trim() !== "";

  if (invoices.length === 0) {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center px-5 py-10 text-center">
        <FileText className="mb-3 size-7 text-muted-foreground/60" />
        <p className="text-sm font-medium">{tInvoices("noInvoices")}</p>
        <Button
          className="mt-4"
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href="/accounting/invoices/new" />}
        >
          <Plus className="size-4" />
          {tInvoices("newInvoice")}
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3 border-b px-3 py-3 sm:px-5">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchLabel")}
            className="h-9 pl-8"
          />
        </div>
        <div
          ref={filterBarRef}
          role="group"
          aria-label={tInvoices("status")}
          className="scroll-fade-x -mx-3 flex gap-1.5 px-3 sm:-mx-5 sm:px-5"
        >
          {INVOICE_STATUS_FILTERS.map((option) => {
            const active = option === status;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={active}
                onClick={() => setInvoiceStatusParam(option)}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "bg-background text-muted-foreground hover:text-foreground",
                  !active &&
                    option === "overdue" &&
                    counts.overdue > 0 &&
                    "text-destructive hover:text-destructive",
                )}
              >
                {filterLabels[option]}
                <span
                  className={cn(
                    "tabular-nums",
                    active ? "text-background/70" : "text-muted-foreground",
                  )}
                >
                  {counts[option]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex min-h-40 flex-col items-center justify-center px-5 py-10 text-center">
          <Search className="mb-3 size-6 text-muted-foreground/60" />
          <p className="text-sm font-medium">{t("noMatchingInvoices")}</p>
          {filtersActive ? (
            <Button
              className="mt-3"
              variant="outline"
              size="sm"
              onClick={() => {
                setQuery("");
                setInvoiceStatusParam("all");
              }}
            >
              <X className="size-4" />
              {t("resetFilters")}
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-2 p-3 md:hidden">
            {filtered.map((invoice) => {
              const overdue = isInvoiceOverdue(invoice, today);
              return (
                <li key={invoice.id} className="min-w-0">
                  <a
                    href={`/accounting/invoices/${invoice.id}`}
                    className={cn(
                      "block min-w-0 rounded-xl border bg-background p-3.5 transition hover:border-foreground/25 focus-visible:outline-2 focus-visible:outline-offset-2",
                      overdue && "border-destructive/40",
                    )}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{invoice.invoiceNumber}</p>
                        <p className="mt-0.5 line-clamp-2 text-sm break-words text-muted-foreground">
                          {invoice.customerName}
                        </p>
                        {invoice.projects && invoice.projects.length > 0 && (
                          <p className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                            {invoice.projects.map((project) => (
                              <span key={project.id} className="inline-flex min-w-0 items-center gap-1">
                                <ProjectDot color={project.color} />
                                <span className="truncate">{project.name}</span>
                              </span>
                            ))}
                          </p>
                        )}
                      </div>
                      <p className="shrink-0 font-semibold tabular-nums">
                        {formatCents(invoice.grossCents, locale)}
                      </p>
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t pt-2.5">
                      <span className="text-xs text-muted-foreground">
                        {tInvoices("dueDate")}: {dueDate(invoice)}
                      </span>
                      {statusBadge(invoice)}
                    </div>
                  </a>
                </li>
              );
            })}
          </ul>

          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">{tInvoices("invoiceNumber")}</TableHead>
                  <TableHead>{tInvoices("customer")}</TableHead>
                  <TableHead>{tInvoices("dueDate")}</TableHead>
                  <TableHead>{tInvoices("status")}</TableHead>
                  <TableHead className="pr-5 text-right">{tInvoices("total")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((invoice) => {
                  const overdue = isInvoiceOverdue(invoice, today);
                  return (
                    <TableRow
                      key={invoice.id}
                      className={cn("relative", overdue && "bg-destructive/5 hover:bg-destructive/10")}
                    >
                      <TableCell className="pl-5 font-medium">
                        <a
                          href={`/accounting/invoices/${invoice.id}`}
                          className="after:absolute after:inset-0 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                          {invoice.invoiceNumber}
                        </a>
                      </TableCell>
                      <TableCell>
                        {invoice.customerName}
                        <br />
                        <UserAttribution userId={invoice.createdBy} relation="createdBy" />
                        {invoice.projects && invoice.projects.length > 0 && (
                          <span className="relative z-10 mt-1 flex flex-wrap gap-1">
                            {invoice.projects.map((project) => (
                              <ProjectChip key={project.id} project={project} size="xs" />
                            ))}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{dueDate(invoice)}</TableCell>
                      <TableCell>{statusBadge(invoice)}</TableCell>
                      <TableCell className="pr-5 text-right font-medium tabular-nums">
                        {formatCents(invoice.grossCents, locale)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </>
  );
}
