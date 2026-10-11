import { Suspense } from "react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import {
  ArrowRight,
  Paperclip,
  Upload,
  Users,
} from "@/components/server-safe-icons";
import { AccountingPageHeader } from "@/modules/accounting/components/accounting-page-header";
import { SECTION_PAGE_SHORTCUTS } from "@/lib/app-shortcuts";
import { requireUser } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import { toLocalIsoDate } from "@/modules/accounting/lib/date";
import {
  invoiceStatusSummary,
  listInvoicesPage,
} from "@/modules/accounting/invoice-queries";
import {
  listReceiptDocumentsPage,
  receiptDocumentCount,
} from "@/modules/accounting/queries";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CreateShortcutLink } from "./create-shortcut-link";
import { InvoiceList, OverdueFilterTile } from "./invoice-list";
import { linkedProjectsFor } from "@/modules/context/project-link-refs";
import { ReceiptArchiveList } from "./receipt-archive-list";

export async function DocumentsWorkspace({
  cursor,
  receiptCursor,
  basePath = "/documents",
}: {
  cursor?: string;
  receiptCursor?: string;
  basePath?: string;
} = {}) {
  const [t, tInvoices, tCommon] = await Promise.all([
    getTranslations("documents"),
    getTranslations("invoices"),
    getTranslations("common"),
  ]);
  const locale = await getLocale();
  const invoicePage = listInvoicesPage({ cursor, limit: 50 });
  const invoices = invoicePage.items;
  const projectsByInvoice = linkedProjectsFor("invoice", invoices.map((invoice) => invoice.id));
  const user = await requireUser();
  const includePersonnel = user.role === "admin" || user.role === "personnel";
  const receiptPage = listReceiptDocumentsPage({
    cursor: receiptCursor,
    limit: 50,
    includePersonnel,
  });
  const receipts = receiptPage.items;
  const totalReceipts = receiptDocumentCount(includePersonnel);
  const today = toLocalIsoDate();
  const summary = invoiceStatusSummary(today);

  return (
    <div className="flex flex-col gap-5">
      <AccountingPageHeader
        className="mb-0"
        title={t("title")}
        description={t("description")}
        actions={
          <>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/accounting?new=expense" />}
            >
              <Upload className="size-4" />
              {t("captureReceipt")}
            </Button>
            <CreateShortcutLink href="/accounting/invoices/new" label={tInvoices("newInvoice")} shortcut={SECTION_PAGE_SHORTCUTS.accounting.newInvoice} />
          </>
        }
      />

      <section
        className="grid grid-cols-2 overflow-hidden rounded-xl border bg-card shadow-card xl:grid-cols-4"
        aria-label={t("workStatus")}
      >
        <div className="min-w-0 px-[18px] py-4 shadow-[1px_0_0_var(--border),0_1px_0_var(--border)]">
          <p className="truncate text-[11px] font-semibold tracking-[0.12em] text-text-tertiary uppercase">{t("drafts")}</p>
          <p className="mt-2 text-[22px] leading-tight font-semibold tracking-[-0.02em] tabular-nums">{summary.draftCount}</p>
        </div>
        <div className="min-w-0 px-[18px] py-4 shadow-[1px_0_0_var(--border),0_1px_0_var(--border)]">
          <p className="truncate text-[11px] font-semibold tracking-[0.12em] text-text-tertiary uppercase">
            {t("openInvoices")}
          </p>
          <p className="mt-2 truncate text-lg leading-tight font-semibold tracking-[-0.02em] tabular-nums sm:text-[22px]">
            {formatCents(summary.outstandingCents, locale)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("outstanding", { count: summary.openCount })}
          </p>
        </div>
        <div className="min-w-0 shadow-[1px_0_0_var(--border),0_1px_0_var(--border)]">
          <OverdueFilterTile
            count={summary.overdueCount}
            label={t("overdue")}
            hint={t("showOverdue")}
          />
        </div>
        <div className="min-w-0 px-[18px] py-4 shadow-[1px_0_0_var(--border),0_1px_0_var(--border)]">
          <p className="truncate text-[11px] font-semibold tracking-[0.12em] text-text-tertiary uppercase">
            {t("receiptCount")}
          </p>
          <p className="mt-2 text-[22px] leading-tight font-semibold tracking-[-0.02em] tabular-nums">{totalReceipts}</p>
        </div>
      </section>

      <div className="grid min-w-0 grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.75fr)]">
        <section
          id="invoices"
          className="min-w-0 scroll-mt-4 overflow-hidden rounded-xl border bg-card shadow-card"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line-soft px-[18px] py-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] font-semibold">{t("invoiceSection")}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("invoiceSectionDescription")}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link href="/accounting/customers" />}
            >
              <Users className="size-4" />
              {tInvoices("customers")}
            </Button>
          </div>

          <Suspense fallback={<div className="min-h-40" />}>
            <InvoiceList
              today={today}
              invoices={invoices.map((invoice) => ({
                id: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
                customerName: invoice.customerName,
                dueDate: invoice.dueDate,
                status: invoice.status,
                grossCents: invoice.grossCents,
                createdBy: invoice.createdBy,
                projects: projectsByInvoice.get(invoice.id) ?? [],
              }))}
            />
          </Suspense>
          {invoicePage.nextCursor && (
            <div className="flex justify-end border-t border-line-soft px-[18px] py-3">
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={
                  <Link
                    href={`${basePath}?cursor=${encodeURIComponent(invoicePage.nextCursor)}${receiptCursor ? `&receiptCursor=${encodeURIComponent(receiptCursor)}` : ""}`}
                  />
                }
              >
                {tCommon("nextPage")}
                <ArrowRight className="size-4" />
              </Button>
            </div>
          )}
        </section>

        <section className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-card">
          <div className="border-b border-line-soft px-[18px] py-3">
            <h2 className="text-[15px] font-semibold">{t("receiptSection")}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("receiptSectionDescription")}
            </p>
          </div>

          {receipts.length === 0 ? (
            <EmptyState
              icon={<Paperclip />}
              title={t("noReceipts")}
              description={t("noReceiptsHint")}
              actions={
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<Link href="/accounting?new=expense" />}
                >
                  <Upload className="size-4" />
                  {t("captureReceipt")}
                </Button>
              }
            />
          ) : (
            <ReceiptArchiveList
              receipts={receipts.map((receipt) => ({
                id: receipt.id,
                fileName: receipt.fileName,
                sizeBytes: receipt.sizeBytes,
                uploadedBy: receipt.uploadedBy,
                entryKind: receipt.entryKind,
                entryDate: receipt.entryDate,
                description: receipt.description,
                counterparty: receipt.counterparty,
                categoryName: receipt.categoryName,
                grossAmountCents: receipt.grossAmountCents,
              }))}
            />
          )}
          {receiptPage.nextCursor && (
            <div className="flex justify-end border-t border-line-soft px-[18px] py-3">
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={
                  <Link
                    href={`${basePath}?receiptCursor=${encodeURIComponent(receiptPage.nextCursor)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`}
                  />
                }
              >
                {tCommon("nextPage")}
                <ArrowRight className="size-4" />
              </Button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
