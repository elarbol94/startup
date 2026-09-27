"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowRight, CalendarClock, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { setNetworkLeadStatus } from "../lead-actions";
import { isLeadActive, isLeadOverdue } from "../network-utils";
import type { NetworkLeadView } from "../queries";
import { LeadTaskButton } from "./lead-task-button";
import { dateOnly } from "./network-ui";
import { useNetworkAction } from "./use-network-action";

/**
 * Leads as a checklist: ticking one marks it done, "asked" records that we
 * reached out and are waiting.
 */
export function LeadList({
  leads,
  today,
  showContact,
  onEdit,
}: {
  leads: NetworkLeadView[];
  today: string;
  showContact?: boolean;
  onEdit: (lead: NetworkLeadView) => void;
}) {
  const t = useTranslations("network");
  const format = useFormatter();
  const { pending, run } = useNetworkAction();

  return (
    <ul className="divide-y overflow-hidden rounded-2xl border bg-card" data-testid="network-lead-list">
      {leads.map((lead) => {
        const active = isLeadActive(lead.status);
        const overdue = isLeadOverdue(lead, today);
        const target = lead.targetContact?.name || [lead.targetName, lead.targetOrganization].filter(Boolean).join(" · ");
        return (
          <li key={lead.id} className="flex items-start gap-3 px-4 py-3">
            <Checkbox
              className="mt-1"
              checked={lead.status === "done"}
              disabled={pending || lead.status === "dropped"}
              aria-label={t("lead.markDone", { summary: lead.summary })}
              onCheckedChange={(checked) => run(() => setNetworkLeadStatus({ id: lead.id, status: checked ? "done" : "open" }))}
            />
            <div className="min-w-0 flex-1 space-y-1">
              <div className={cn("text-sm", !active && "text-muted-foreground line-through")}>
                {showContact && (
                  <Link href={`/network/${lead.contactId}`} className="font-medium hover:underline">{lead.contactName}</Link>
                )}
                {showContact && <span className="text-muted-foreground"> · </span>}
                <span className="text-muted-foreground">{t(`kinds.${lead.kind}`)}:</span> {lead.summary}
              </div>
              {(target || lead.nextStep || lead.dueOn || lead.status !== "open" || lead.task) && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {target && (
                    <span className="inline-flex items-center gap-1">
                      <ArrowRight className="size-3" />
                      {lead.targetContact ? (
                        <Link href={`/network/${lead.targetContact.id}`} className="hover:underline">{target}</Link>
                      ) : target}
                    </span>
                  )}
                  {lead.nextStep && <span>{t("lead.next", { step: lead.nextStep })}</span>}
                  {lead.dueOn && (
                    <span className={cn("inline-flex items-center gap-1", overdue && "font-medium text-destructive")}>
                      <CalendarClock className="size-3" />
                      {format.dateTime(dateOnly(lead.dueOn), { dateStyle: "medium", timeZone: "UTC" })}
                    </span>
                  )}
                  {lead.status !== "open" && <span className="rounded-full border px-1.5">{t(`statuses.${lead.status}`)}</span>}
                  {lead.task && <LeadTaskButton lead={lead} />}
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {lead.status === "open" && (
                <Button size="xs" variant="outline" disabled={pending} onClick={() => run(() => setNetworkLeadStatus({ id: lead.id, status: "asked" }))}>
                  {t("lead.markAsked")}
                </Button>
              )}
              {!lead.task && active && <LeadTaskButton lead={lead} />}
              <Button size="icon-sm" variant="ghost" aria-label={t("lead.edit")} onClick={() => onEdit(lead)}>
                <Pencil />
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
