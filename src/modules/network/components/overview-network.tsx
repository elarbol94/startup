"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowRight, Handshake } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { markNetworkContactContacted } from "../contact-actions";
import { setNetworkLeadStatus } from "../lead-actions";
import { isLeadOverdue } from "../network-utils";
import type { NetworkLeadView } from "../queries";
import type { NetworkReconnectItem } from "../reconnect-queries";
import { dateOnly } from "./network-ui";
import { useReconnectDueLabel } from "./reconnect-list";
import { useNetworkAction } from "./use-network-action";

/** Dashboard section: the viewer's open follow-ups from the network, soonest first, then people to reconnect with. */
export function OverviewNetwork({
  leads,
  reconnects,
  total,
  today,
}: {
  leads: NetworkLeadView[];
  reconnects: NetworkReconnectItem[];
  total: number;
  today: string;
}) {
  const t = useTranslations("network");
  const tl = useTranslations("overviewLayout");
  const format = useFormatter();
  const { pending, run } = useNetworkAction();
  const dueLabel = useReconnectDueLabel(today);
  const shown = leads.length + reconnects.length;

  return (
    <section className="flex h-full min-h-0 flex-col bg-card" aria-label={tl("network")}>
      <header className="flex shrink-0 items-center gap-3 border-b px-4 py-4">
        <Handshake className="size-4 text-muted-foreground" />
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{tl("network")}</h2>
        <Link href="/network/opportunities" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          {total > shown ? tl("showAllRows", { count: total }) : tl("openSection", { section: t("title") })}
          <ArrowRight className="size-3" />
        </Link>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {shown ? (
          <ul data-testid="overview-network">
            {leads.map((lead) => (
              <li key={lead.id} className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-muted/60">
                <Checkbox
                  className="mt-0.5"
                  disabled={pending}
                  checked={false}
                  aria-label={t("lead.markDone", { summary: lead.summary })}
                  onCheckedChange={() => run(() => setNetworkLeadStatus({ id: lead.id, status: "done" }))}
                />
                <Link href={`/network/${lead.contactId}`} className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    <span className="font-medium">{lead.contactName}</span>
                    <span className="text-muted-foreground"> · </span>
                    {lead.nextStep || lead.summary}
                  </span>
                  <span className="flex gap-2 text-xs text-muted-foreground">
                    <span>{t(`kinds.${lead.kind}`)}</span>
                    {lead.status === "asked" && <span>{t("statuses.asked")}</span>}
                    {lead.dueOn && (
                      <span className={cn(isLeadOverdue(lead, today) && "font-medium text-destructive")}>
                        {format.dateTime(dateOnly(lead.dueOn), { dateStyle: "medium", timeZone: "UTC" })}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
            {reconnects.map((contact) => (
              <li key={`reconnect-${contact.id}`} className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-muted/60">
                <Checkbox
                  className="mt-0.5"
                  disabled={pending}
                  checked={false}
                  aria-label={t("reconnect.markContactedFor", { name: contact.name })}
                  onCheckedChange={() => run(() => markNetworkContactContacted(contact.id))}
                />
                <Link href={`/network/${contact.id}`} className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    <span className="font-medium">{contact.name}</span>
                    {contact.organization && <span className="text-muted-foreground"> · {contact.organization}</span>}
                  </span>
                  <span className="flex gap-2 text-xs text-muted-foreground">
                    <span>{t("reconnect.title")}</span>
                    <span className={cn(contact.dueOn < today && "font-medium text-destructive")}>{dueLabel(contact)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-3 text-sm text-muted-foreground">{t("overview.empty")}</p>
        )}
      </div>
    </section>
  );
}
