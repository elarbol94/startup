import { UserAttribution } from "@/components/user-identity";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, Printer } from "@/components/server-safe-icons";
import { requireUser } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import { getAppSettings } from "@/modules/settings/queries";
import {
  getInvoiceWithItems,
  listCustomers,
} from "@/modules/accounting/invoice-queries";
import { InvoiceEditor } from "@/modules/accounting/components/invoice-editor";
import { LiveProjectLinks } from "@/modules/context/components/project-links-field";
import { linkedProjects } from "@/modules/context/project-link-refs";
import { InvoiceStatusBadge } from "@/modules/accounting/components/invoice-status-badge";
import { InvoiceStatusActions } from "@/modules/accounting/components/invoice-status-actions";
import { Button } from "@/components/ui/button";
import { AccountingNav } from "@/modules/accounting/components/accounting-nav";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const data = getInvoiceWithItems(id);
  if (!data) notFound();
  const { invoice, customer, items, totals } = data;

  const t = await getTranslations("invoices");
  const locale = await getLocale();
  const format = await getFormatter();
  const settings = getAppSettings();
  const customers = listCustomers();

  const isDraft = invoice.status === "draft";

  return (
    <div className="flex flex-col gap-5">
      <AccountingNav />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          nativeButton={false}
          render={<Link href="/accounting/invoices" aria-label={t("title")} />}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.025em] tabular-nums sm:text-[26px]">
          {invoice.invoiceNumber}
        </h1>
        <InvoiceStatusBadge status={invoice.status} /><UserAttribution userId={invoice.createdBy} relation="createdBy" />
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <a
                href={`/print/invoices/${invoice.id}`}
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            <Printer className="size-4" />
            {t("print")}
          </Button>
          <InvoiceStatusActions id={invoice.id} status={invoice.status} />
        </div>
      </div>
      <LiveProjectLinks targetType="invoice" targetId={invoice.id} initial={linkedProjects("invoice", invoice.id)} className="-mt-3" />

      {isDraft ? (
        <InvoiceEditor
          customers={customers}
          initial={{
            id: invoice.id,
            customerId: invoice.customerId,
            issueDate: invoice.issueDate,
            dueDate: invoice.dueDate,
            notes: invoice.notes,
            items,
          }}
          defaultVatRate={settings.kleinunternehmer ? 0 : settings.defaultVatRate}
          vatExempt={settings.kleinunternehmer}
        />
      ) : (
        <div className="flex max-w-3xl flex-col gap-3">
          <p className="text-[13.5px] text-muted-foreground">{t("editOnlyDraft")}</p>
          <section className="overflow-hidden rounded-xl border bg-card shadow-card">
          <div className="grid grid-cols-2 gap-4 border-b border-line-soft px-[18px] py-4 text-[13.5px] sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">{t("customer")}</p>
              <p className="font-medium">{customer?.name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("issueDate")}</p>
              <p className="font-medium tabular-nums">
                {format.dateTime(new Date(invoice.issueDate), {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })}
              </p>
            </div>
            {invoice.dueDate && (
              <div>
                <p className="text-xs text-muted-foreground">{t("dueDate")}</p>
                <p className="font-medium tabular-nums">
                  {format.dateTime(new Date(invoice.dueDate), {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}
                </p>
              </div>
            )}
          </div>

          <Table className="text-[13.5px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent [&>th]:h-9 [&>th]:text-[11.5px] [&>th]:font-medium [&>th]:text-muted-foreground">
                <TableHead className="pl-[18px]">{t("itemDescription")}</TableHead>
                <TableHead className="text-right">{t("quantity")}</TableHead>
                <TableHead className="text-right">{t("unitPrice")}</TableHead>
                <TableHead className="text-right">USt</TableHead>
                <TableHead className="pr-[18px] text-right">{t("lineTotal")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id} className="h-[42px] border-line-soft">
                  <TableCell className="pl-[18px]">{item.description}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {(item.quantityThousandths / 1000).toLocaleString(locale)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCents(item.unitPriceCents, locale)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {item.vatRate} %
                  </TableCell>
                  <TableCell className="pr-[18px] text-right font-medium tabular-nums">
                    {formatCents(
                      Math.floor(
                        (item.quantityThousandths * item.unitPriceCents) / 1000 + 0.5,
                      ),
                      locale,
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex flex-col items-end gap-1 border-t px-[18px] py-3.5 text-[13.5px] text-text-secondary">
            <span>
              {t("subtotal")}:{" "}
              <span className="tabular-nums">
                {formatCents(totals.netCents, locale)}
              </span>
            </span>
            {totals.byRate
              .filter((group) => group.vatRate > 0)
              .map((group) => (
                <span key={group.vatRate}>
                  {t("vatAmount", { rate: group.vatRate })}:{" "}
                  <span className="tabular-nums">
                    {formatCents(group.vatCents, locale)}
                  </span>
                </span>
              ))}
            <span className="mt-1 text-[15px] font-semibold text-foreground">
              {t("total")}:{" "}
              <span className="tabular-nums">
                {formatCents(totals.grossCents, locale)}
              </span>
            </span>
          </div>
          </section>
        </div>
      )}
    </div>
  );
}
