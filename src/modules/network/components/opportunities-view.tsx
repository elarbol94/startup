"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SelectAllCheckbox } from "@/components/row-selection";
import { SelectionBar } from "@/components/selection-bar";
import { useBulkAction } from "@/lib/use-bulk-action";
import { useRowSelection } from "@/lib/use-row-selection";
import { bulkDeleteLeads, bulkSetLeadStatus } from "../bulk-actions";
import { leadStatuses } from "../constants";
import type { NetworkContactOption, NetworkLeadView } from "../queries";
import { LeadDialog, type LeadDialogState } from "./lead-dialog";
import { LeadList } from "./lead-list";

/** "Open opportunities": everything someone offered that we have not followed up yet. */
export function OpportunitiesView({
  leads,
  contacts,
  organizationNames,
  includeClosed,
  today,
}: {
  leads: NetworkLeadView[];
  contacts: NetworkContactOption[];
  organizationNames: string[];
  includeClosed: boolean;
  today: string;
}) {
  const t = useTranslations("network");
  const tCommon = useTranslations("common");
  const [dialog, setDialog] = useState<LeadDialogState>(null);
  const [selecting, setSelecting] = useState(false);
  const ids = useMemo(() => (selecting ? leads.map((lead) => lead.id) : []), [leads, selecting]);
  const selection = useRowSelection(ids);
  const { run, pending } = useBulkAction(selection.deselect);
  const [confirmDialog, confirm] = useConfirm();
  function stopSelecting() {
    selection.clear();
    setSelecting(false);
  }
  async function remove() {
    const ok = await confirm({ title: t("bulk.deleteLeadsTitle", { count: selection.count }), description: t("bulk.deleteLeadsConfirm"), confirmLabel: tCommon("delete"), destructive: true });
    if (ok) await run(() => bulkDeleteLeads({ ids: selection.selectedIds }));
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <p className="text-muted-foreground">{t("opportunities.intro")}</p>
        <div className="flex shrink-0 items-center gap-3">
        {leads.length > 0 && (
          <Button size="sm" variant={selecting ? "secondary" : "outline"} aria-pressed={selecting} onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>
            {selecting ? t("bulk.doneSelecting") : t("bulk.select")}
          </Button>
        )}
        <Link
          href={includeClosed ? "/network/opportunities" : "/network/opportunities?show=all"}
          className="shrink-0 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {includeClosed ? t("opportunities.hideClosed") : t("opportunities.showClosed")}
        </Link>
        </div>
      </div>
      {selecting && leads.length > 0 && (
        <div className="flex items-center gap-3 px-4 text-xs text-muted-foreground">
          <SelectAllCheckbox selection={selection} />
          <span>{tCommon("selection.selectAll")}</span>
        </div>
      )}
      {leads.length ? (
        <LeadList leads={leads} today={today} showContact onEdit={(lead) => setDialog({ mode: "edit", lead })} selection={selecting ? selection : undefined} />
      ) : (
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("opportunities.empty")}</div>
      )}
      <SelectionBar count={selection.count} onClear={selection.clear}>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="sm" disabled={pending} />}>{tCommon("status")}<ChevronDown className="size-3.5" /></DropdownMenuTrigger>
          <DropdownMenuContent align="center">
            {leadStatuses.map((status) => <DropdownMenuItem key={status} onClick={() => void run(() => bulkSetLeadStatus({ ids: selection.selectedIds, status }))}>{t(`statuses.${status}`)}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={pending} onClick={() => void remove()}><Trash2 className="size-4" />{tCommon("delete")}</Button>
      </SelectionBar>
      {confirmDialog}
      <LeadDialog state={dialog} onClose={() => setDialog(null)} contacts={contacts} organizationNames={organizationNames} />
    </div>
  );
}
