"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { NetworkContactOption, NetworkLeadView } from "../queries";
import { LeadDialog, type LeadDialogState } from "./lead-dialog";
import { LeadList } from "./lead-list";

/** "Open opportunities": everything someone offered that we have not followed up yet. */
export function OpportunitiesView({
  leads,
  contacts,
  includeClosed,
  today,
}: {
  leads: NetworkLeadView[];
  contacts: NetworkContactOption[];
  includeClosed: boolean;
  today: string;
}) {
  const t = useTranslations("network");
  const [dialog, setDialog] = useState<LeadDialogState>(null);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <p className="text-muted-foreground">{t("opportunities.intro")}</p>
        <Link
          href={includeClosed ? "/network/opportunities" : "/network/opportunities?show=all"}
          className="shrink-0 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {includeClosed ? t("opportunities.hideClosed") : t("opportunities.showClosed")}
        </Link>
      </div>
      {leads.length ? (
        <LeadList leads={leads} today={today} showContact onEdit={(lead) => setDialog({ mode: "edit", lead })} />
      ) : (
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("opportunities.empty")}</div>
      )}
      <LeadDialog state={dialog} onClose={() => setDialog(null)} contacts={contacts} />
    </div>
  );
}
