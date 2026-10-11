import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

// Invoice status colours carry meaning (design 1b status pills: Entwurf, Versendet,
// Bezahlt). There are no --status-* tokens in globals.css yet, so the 1b values
// (slate/blue/green 100 ↔ 800/950 ↔ 300) live here; canceled uses the destructive token.
const VARIANTS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  sent: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  paid: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  canceled: "bg-destructive/15 text-destructive",
};

/** Small pill for an invoice status (design 1b). */
export function StatusPill({ className, children, title }: { className?: string; children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center rounded-full px-2 text-[11px] font-semibold whitespace-nowrap",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function InvoiceStatusBadge({ status }: { status: string }) {
  const t = useTranslations("invoices");
  const label = {
    draft: t("statusDraft"),
    sent: t("statusSent"),
    paid: t("statusPaid"),
    canceled: t("statusCanceled"),
  }[status];

  return (
    <StatusPill className={VARIANTS[status] ?? "bg-muted text-text-secondary"}>
      {label ?? status}
    </StatusPill>
  );
}
