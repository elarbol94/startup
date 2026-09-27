"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { leadKinds, leadStatuses, type LeadKind, type LeadStatus } from "../constants";
import { deleteNetworkLead, saveNetworkLead } from "../lead-actions";
import type { NetworkContactOption, NetworkLeadView } from "../queries";
import { selectClassName } from "./network-ui";
import { useNetworkAction } from "./use-network-action";

export type LeadDialogState = { mode: "create"; contactId: string } | { mode: "edit"; lead: NetworkLeadView } | null;

type FormState = {
  kind: LeadKind;
  summary: string;
  targetName: string;
  targetOrganization: string;
  targetContactId: string;
  status: LeadStatus;
  nextStep: string;
  dueOn: string;
};

function initialForm(state: NonNullable<LeadDialogState>): FormState {
  if (state.mode === "create") {
    return { kind: "intro", summary: "", targetName: "", targetOrganization: "", targetContactId: "", status: "open", nextStep: "", dueOn: "" };
  }
  const { lead } = state;
  return {
    kind: lead.kind,
    summary: lead.summary,
    targetName: lead.targetName,
    targetOrganization: lead.targetOrganization,
    targetContactId: lead.targetContact?.id ?? "",
    status: lead.status,
    nextStep: lead.nextStep,
    dueOn: lead.dueOn ?? "",
  };
}

export function LeadDialog({
  state,
  onClose,
  contacts,
}: {
  state: LeadDialogState;
  onClose: () => void;
  contacts: NetworkContactOption[];
}) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      {state && (
        <LeadForm key={state.mode === "edit" ? state.lead.id : `new-${state.contactId}`} state={state} onClose={onClose} contacts={contacts} />
      )}
    </Dialog>
  );
}

function LeadForm({
  state,
  onClose,
  contacts,
}: {
  state: NonNullable<LeadDialogState>;
  onClose: () => void;
  contacts: NetworkContactOption[];
}) {
  const t = useTranslations("network");
  const id = useId();
  const { pending, run } = useNetworkAction();
  const [form, setForm] = useState<FormState>(() => initialForm(state));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editing = state.mode === "edit" ? state.lead : null;
  const contactId = editing ? editing.contactId : state.mode === "create" ? state.contactId : "";
  const set = (patch: Partial<FormState>) => setForm((current) => ({ ...current, ...patch }));

  function submit(event: FormEvent) {
    event.preventDefault();
    run(
      () => saveNetworkLead({ ...form, id: editing?.id, contactId, targetContactId: form.targetContactId || null, dueOn: form.dueOn || null }),
      () => {
        toast.success(t("lead.saved"));
        onClose();
      },
    );
  }

  function remove() {
    if (!editing) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    run(() => deleteNetworkLead(editing.id), () => {
      toast.success(t("lead.deleted"));
      onClose();
    });
  }

  return (
    <DialogContent className="sm:max-w-xl">
      <form onSubmit={submit} className="space-y-4">
        <DialogHeader>
          <DialogTitle>{editing ? t("lead.editTitle") : t("lead.createTitle")}</DialogTitle>
          <DialogDescription>{t("lead.description")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-kind`}>{t("fields.kind")}</Label>
            <select id={`${id}-kind`} className={selectClassName} value={form.kind} onChange={(event) => set({ kind: event.target.value as LeadKind })}>
              {leadKinds.map((kind) => <option key={kind} value={kind}>{t(`kinds.${kind}`)}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-status`}>{t("fields.status")}</Label>
            <select id={`${id}-status`} className={selectClassName} value={form.status} onChange={(event) => set({ status: event.target.value as LeadStatus })}>
              {leadStatuses.map((status) => <option key={status} value={status}>{t(`statuses.${status}`)}</option>)}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`${id}-summary`}>{t("fields.summary")}</Label>
            <Textarea id={`${id}-summary`} required rows={2} maxLength={1000} value={form.summary} placeholder={t("lead.summaryPlaceholder")} onChange={(event) => set({ summary: event.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-target-name`}>{t("fields.targetName")}</Label>
            <Input id={`${id}-target-name`} maxLength={160} value={form.targetName} placeholder={t("lead.targetNamePlaceholder")} onChange={(event) => set({ targetName: event.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-target-org`}>{t("fields.targetOrganization")}</Label>
            <Input id={`${id}-target-org`} maxLength={160} value={form.targetOrganization} placeholder={t("lead.targetOrganizationPlaceholder")} onChange={(event) => set({ targetOrganization: event.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`${id}-target-contact`}>{t("fields.targetContact")}</Label>
            <select id={`${id}-target-contact`} className={selectClassName} value={form.targetContactId} onChange={(event) => set({ targetContactId: event.target.value })}>
              <option value="">{t("lead.noTargetContact")}</option>
              {contacts.filter((contact) => contact.id !== contactId).map((contact) => (
                <option key={contact.id} value={contact.id}>{contact.organization ? `${contact.name} · ${contact.organization}` : contact.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-next`}>{t("fields.nextStep")}</Label>
            <Input id={`${id}-next`} maxLength={500} value={form.nextStep} placeholder={t("lead.nextStepPlaceholder")} onChange={(event) => set({ nextStep: event.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-due`}>{t("fields.dueOn")}</Label>
            <Input id={`${id}-due`} type="date" value={form.dueOn} onChange={(event) => set({ dueOn: event.target.value })} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          {editing && (
            <Button type="button" variant="destructive" disabled={pending} onClick={remove} className="sm:mr-auto">
              {confirmDelete ? t("lead.confirmDelete") : t("lead.delete")}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onClose}>{t("cancel")}</Button>
          <Button type="submit" disabled={pending || !form.summary.trim()}>{t("save")}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
