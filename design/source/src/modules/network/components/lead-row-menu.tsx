"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CircleDot, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { leadStatuses } from "../constants";
import { deleteNetworkLead, setNetworkLeadStatus } from "../lead-actions";
import type { NetworkLeadView } from "../queries";
import { useNetworkAction } from "./use-network-action";

/** Per-lead "⋯" menu: any status (including "dropped"), edit and delete. */
export function LeadRowMenu({ lead, onEdit }: { lead: NetworkLeadView; onEdit: () => void }) {
  const t = useTranslations("network");
  const tCommon = useTranslations("common");
  const { pending, run } = useNetworkAction();
  const [confirmDialog, confirm] = useConfirm();
  async function remove() {
    const ok = await confirm({ title: t("lead.confirmDelete"), description: lead.summary, confirmLabel: t("lead.delete"), destructive: true });
    if (ok) run(() => deleteNetworkLead(lead.id), () => toast.success(t("lead.deleted")));
  }
  return <>
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" disabled={pending} aria-label={tCommon("more", { name: lead.summary })} />}>
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={onEdit}><Pencil />{t("lead.edit")}</DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger><CircleDot />{tCommon("status")}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={lead.status} onValueChange={(status) => run(() => setNetworkLeadStatus({ id: lead.id, status: status as string }))}>
              {leadStatuses.map((status) => <DropdownMenuRadioItem key={status} value={status}>{t(`statuses.${status}`)}</DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => void remove()}><Trash2 />{t("lead.delete")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    {confirmDialog}
  </>;
}
