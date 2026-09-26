// "Connected to this project": events, invoices, bookings and customers tagged
// with the project. Used by the project page's knowledge view.
import type { ReactNode } from "react";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { CalendarDays, FileText, Link2, ReceiptText, UsersRound } from "lucide-react";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { InvoiceStatusBadge } from "@/modules/accounting/components/invoice-status-badge";
import type { ProjectConnectionItem, ProjectConnections } from "@/modules/context/project-links";

function Section({
  icon,
  title,
  items,
  render,
}: {
  icon: ReactNode;
  title: string;
  items: ProjectConnectionItem[];
  render: (item: ProjectConnectionItem) => ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <section className="grid gap-1">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase [&_svg]:size-3.5">
        {icon}
        {title}
        <span className="font-normal tabular-nums">{items.length}</span>
      </h3>
      <ul className="grid">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className="flex min-w-0 items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
            >
              {render(item)}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export async function ProjectConnectionsPanel({ connections, today }: { connections: ProjectConnections; today: string }) {
  const t = await getTranslations("projectLinks.connections");
  const format = await getFormatter();
  const locale = await getLocale();
  const date = (value: string | null) =>
    value ? format.dateTime(new Date(`${value}T00:00:00`), { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
  const empty = Object.values(connections).every((items) => items.length === 0);

  return (
    <section id="connections" className="scroll-mt-20 rounded-2xl border bg-card p-4">
      <header className="mb-3 flex items-center gap-2">
        <Link2 className="size-4 text-muted-foreground" />
        <div>
          <h2 className="text-sm font-semibold">{t("title")}</h2>
          <p className="text-xs text-muted-foreground">{t("description")}</p>
        </div>
      </header>
      {empty ? (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="grid gap-4">
          <Section
            icon={<CalendarDays />}
            title={t("events")}
            items={connections.events}
            render={(item) => (
              <>
                <span className={cn("w-20 shrink-0 text-xs tabular-nums", (item.date ?? "") < today ? "text-muted-foreground" : "font-medium")}>
                  {date(item.date)}
                </span>
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                {item.detail === "recurring" && <span className="text-[11px] text-muted-foreground">{t("recurring")}</span>}
              </>
            )}
          />
          <Section
            icon={<FileText />}
            title={t("invoices")}
            items={connections.invoices}
            render={(item) => (
              <>
                <span className="w-20 shrink-0 font-mono text-xs">{item.title}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{item.detail}</span>
                {item.status && <InvoiceStatusBadge status={item.status} />}
              </>
            )}
          />
          <Section
            icon={<ReceiptText />}
            title={t("entries")}
            items={connections.entries}
            render={(item) => (
              <>
                <span className="w-20 shrink-0 text-xs tabular-nums text-muted-foreground">{date(item.date)}</span>
                <span className={cn("min-w-0 flex-1 truncate", item.status === "voided" && "line-through opacity-60")}>
                  {item.title}
                </span>
                {item.status === "draft" && <span className="text-[11px] text-muted-foreground">{t("draft")}</span>}
                {item.amountCents !== undefined && (
                  <span className={cn("shrink-0 text-xs tabular-nums", item.kind === "income" ? "text-emerald-700 dark:text-emerald-400" : "")}>
                    {item.kind === "expense" ? "−" : "+"}
                    {formatCents(item.amountCents, locale)}
                  </span>
                )}
              </>
            )}
          />
          <Section
            icon={<UsersRound />}
            title={t("customers")}
            items={connections.customers}
            render={(item) => (
              <>
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                {item.detail && <span className="truncate text-xs text-muted-foreground">{item.detail}</span>}
              </>
            )}
          />
        </div>
      )}
    </section>
  );
}
