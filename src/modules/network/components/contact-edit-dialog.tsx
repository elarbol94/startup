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
import { updateNetworkContact } from "../contact-actions";
import { contactClosenessLevels, contactRelationships } from "../constants";
import type { NetworkContactDetail } from "../queries";
import { MunicipalityPicker, type MunicipalityValue } from "./municipality-picker";
import type { Suggestion } from "../network-utils";
import { reconnectPresets } from "../reconnect-utils";
import { selectClassName } from "./network-ui";
import { SuggestInput } from "./suggest-input";
import { useNetworkAction } from "./use-network-action";

type FormState = {
  name: string;
  organization: string;
  role: string;
  relationship: string;
  closeness: string;
  metContext: string;
  email: string;
  phone: string;
  linkedinUrl: string;
  notes: string;
  lastContactOn: string;
  /** Days as a string for the select; "" means no reminder. */
  reconnectEveryDays: string;
  municipality: MunicipalityValue;
};

function initialForm(contact: NetworkContactDetail): FormState {
  return {
    name: contact.name,
    organization: contact.organization,
    role: contact.role,
    relationship: contact.relationship ?? "",
    closeness: contact.closeness ?? "",
    metContext: contact.metContext,
    email: contact.email,
    phone: contact.phone,
    linkedinUrl: contact.linkedinUrl,
    notes: contact.notes,
    lastContactOn: contact.lastContactOn ?? "",
    reconnectEveryDays: contact.reconnectEveryDays ? String(contact.reconnectEveryDays) : "",
    municipality: contact.municipalityCode ? { code: contact.municipalityCode, name: contact.municipalityName ?? contact.municipalityCode } : null,
  };
}

export function ContactEditDialog({
  contact,
  organizationNames,
  metContextSuggestions,
  open,
  onClose,
}: {
  contact: NetworkContactDetail;
  organizationNames: string[];
  metContextSuggestions: Suggestion[];
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {open && <ContactForm contact={contact} organizationNames={organizationNames} metContextSuggestions={metContextSuggestions} onClose={onClose} />}
    </Dialog>
  );
}

function ContactForm({
  contact,
  organizationNames,
  metContextSuggestions,
  onClose,
}: {
  contact: NetworkContactDetail;
  organizationNames: string[];
  metContextSuggestions: Suggestion[];
  onClose: () => void;
}) {
  const t = useTranslations("network");
  const id = useId();
  const { pending, run } = useNetworkAction();
  const [form, setForm] = useState<FormState>(() => initialForm(contact));
  const set = (patch: Partial<FormState>) => setForm((current) => ({ ...current, ...patch }));

  function submit(event: FormEvent) {
    event.preventDefault();
    run(
      () => updateNetworkContact({
        ...form,
        municipalityCode: form.municipality?.code ?? null,
        id: contact.id,
        relationship: (form.relationship || null) as (typeof contactRelationships)[number] | null,
        closeness: (form.closeness || null) as (typeof contactClosenessLevels)[number] | null,
        lastContactOn: form.lastContactOn || null,
        reconnectEveryDays: form.reconnectEveryDays ? Number(form.reconnectEveryDays) : null,
      }),
      () => {
        toast.success(t("contact.saved"));
        onClose();
      },
    );
  }

  const field = (key: Exclude<keyof FormState, "municipality" | "reconnectEveryDays">, options: { type?: string; maxLength?: number; placeholder?: string; list?: string } = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-${key}`}>{t(`fields.${key}`)}</Label>
      <Input
        id={`${id}-${key}`}
        type={options.type ?? "text"}
        list={options.list}
        maxLength={options.maxLength}
        placeholder={options.placeholder}
        value={form[key]}
        onChange={(event) => set({ [key]: event.target.value })}
      />
    </div>
  );

  return (
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
      <form onSubmit={submit} className="space-y-4">
        <DialogHeader>
          <DialogTitle>{t("contact.editTitle")}</DialogTitle>
          <DialogDescription>{t("contact.editDescription")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`${id}-name`}>{t("fields.name")}</Label>
            <Input id={`${id}-name`} required maxLength={160} value={form.name} onChange={(event) => set({ name: event.target.value })} />
          </div>
          {field("organization", { maxLength: 160, list: `${id}-organizations` })}
          <datalist id={`${id}-organizations`}>{organizationNames.map((name) => <option key={name} value={name} />)}</datalist>
          {field("role", { maxLength: 160 })}
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-relationship`}>{t("fields.relationship")}</Label>
            <select id={`${id}-relationship`} className={selectClassName} value={form.relationship} onChange={(event) => set({ relationship: event.target.value })}>
              <option value="">{t("contact.unset")}</option>
              {contactRelationships.map((value) => <option key={value} value={value}>{t(`relationships.${value}`)}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-closeness`}>{t("fields.closeness")}</Label>
            <select id={`${id}-closeness`} className={selectClassName} value={form.closeness} onChange={(event) => set({ closeness: event.target.value })}>
              <option value="">{t("contact.unset")}</option>
              {contactClosenessLevels.map((value) => <option key={value} value={value}>{t(`closeness.${value}`)}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-metContext`}>{t("fields.metContext")}</Label>
            <SuggestInput
              id={`${id}-metContext`}
              maxLength={300}
              value={form.metContext}
              suggestions={metContextSuggestions}
              placeholder={t("fields.metContextPlaceholder")}
              onChange={(metContext) => set({ metContext })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-municipality`}>{t("fields.municipality")}</Label>
            <MunicipalityPicker id={`${id}-municipality`} value={form.municipality} onChange={(municipality) => set({ municipality })} />
          </div>
          {field("lastContactOn", { type: "date" })}
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-reconnectEveryDays`}>{t("reconnect.field")}</Label>
            <select
              id={`${id}-reconnectEveryDays`}
              className={selectClassName}
              value={form.reconnectEveryDays}
              onChange={(event) => set({ reconnectEveryDays: event.target.value })}
            >
              <option value="">{t("reconnect.none")}</option>
              {reconnectDayOptions(contact.reconnectEveryDays).map((days) => (
                <option key={days} value={String(days)}>{t("reconnect.every", { days })}</option>
              ))}
            </select>
          </div>
          {field("email", { type: "email", maxLength: 254 })}
          {field("phone", { type: "tel", maxLength: 60 })}
          <div className="sm:col-span-2">{field("linkedinUrl", { type: "url", maxLength: 500, placeholder: "https://www.linkedin.com/in/…" })}</div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`${id}-notes`}>{t("fields.notes")}</Label>
            <Textarea id={`${id}-notes`} rows={5} maxLength={20000} value={form.notes} onChange={(event) => set({ notes: event.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>{t("cancel")}</Button>
          <Button type="submit" disabled={pending || !form.name.trim()}>{t("save")}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/** The presets, plus a stored value that is not one of them so editing never changes it silently. */
function reconnectDayOptions(current: number | null) {
  const presets: number[] = [...reconnectPresets];
  return current && !presets.includes(current) ? [...presets, current].sort((a, b) => a - b) : presets;
}
