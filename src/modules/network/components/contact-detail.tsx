"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, CalendarCheck, Lock, Pencil, Plus, Trash2, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteNetworkContact, markNetworkContactContacted, setNetworkContactVisibility } from "../contact-actions";
import type { NetworkContactDetail, NetworkContactOption } from "../queries";
import { ContactEditDialog } from "./contact-edit-dialog";
import { ContactLinks } from "./contact-links";
import { ContactTagsEditor } from "./contact-tags-editor";
import { InteractionLog } from "./interaction-log";
import { LeadDialog, type LeadDialogState } from "./lead-dialog";
import { LeadList } from "./lead-list";
import { dateOnly } from "./network-ui";
import { MunicipalityLink } from "./municipality-link";
import { useNetworkAction } from "./use-network-action";

export function ContactDetail({
  contact,
  contacts,
  tagSuggestions,
  organizationNames,
  today,
}: {
  contact: NetworkContactDetail;
  contacts: NetworkContactOption[];
  tagSuggestions: string[];
  organizationNames: string[];
  today: string;
}) {
  const t = useTranslations("network");
  const format = useFormatter();
  const router = useRouter();
  const { pending, run } = useNetworkAction();
  const [editing, setEditing] = useState(false);
  const [leadDialog, setLeadDialog] = useState<LeadDialogState>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const formatDate = (value: string) => format.dateTime(dateOnly(value), { dateStyle: "medium", timeZone: "UTC" });
  const shared = contact.visibility === "team";

  function remove() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    run(() => deleteNetworkContact(contact.id), () => {
      toast.success(t("contact.deleted", { name: contact.name }));
      router.push("/network");
    });
  }

  const facts = [
    { label: t("fields.relationship"), value: contact.relationship && t(`relationships.${contact.relationship}`) },
    { label: t("fields.closeness"), value: contact.closeness && t(`closeness.${contact.closeness}`) },
    { label: t("fields.municipality"), value: contact.municipalityCode && <MunicipalityLink code={contact.municipalityCode} name={contact.municipalityName ?? contact.municipalityCode} /> },
    { label: t("fields.metContext"), value: contact.metContext },
    { label: t("fields.lastContactOn"), value: contact.lastContactOn && formatDate(contact.lastContactOn) },
    { label: t("fields.email"), value: contact.email && <a className="underline-offset-4 hover:underline" href={`mailto:${contact.email}`}>{contact.email}</a> },
    { label: t("fields.phone"), value: contact.phone && <a className="underline-offset-4 hover:underline" href={`tel:${contact.phone.replace(/\s+/g, "")}`}>{contact.phone}</a> },
    { label: t("fields.linkedinUrl"), value: contact.linkedinUrl && <a className="break-all underline-offset-4 hover:underline" href={contact.linkedinUrl} target="_blank" rel="noreferrer noopener">{contact.linkedinUrl.replace(/^https?:\/\/(www\.)?/, "")}</a> },
  ].filter((fact) => fact.value);

  return (
    <div className="space-y-4" data-testid="network-contact-detail">
      <Link href="/network" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {t("contact.back")}
      </Link>

      <section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight" data-testid="network-contact-name">{contact.name}</h2>
            {(contact.role || contact.organization) && (
              <p className="text-sm text-muted-foreground">
                {contact.role}
                {contact.role && contact.organization && " · "}
                {contact.organizationId ? (
                  <Link href={`/network/organizations/${contact.organizationId}`} className="underline-offset-4 hover:text-foreground hover:underline">
                    {contact.organization}
                  </Link>
                ) : contact.organization}
              </p>
            )}
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
              {shared ? <UsersRound className="size-3.5" /> : <Lock className="size-3.5" />}
              {shared ? t("visibility.teamHint") : t("visibility.privateHint")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={pending || contact.lastContactOn === today} onClick={() => run(() => markNetworkContactContacted(contact.id), () => toast.success(t("contact.contactedToday")))}>
              <CalendarCheck className="size-4" />
              {t("contact.markContacted")}
            </Button>
            {contact.canEdit && (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="size-4" />
                {t("contact.edit")}
              </Button>
            )}
            {contact.canManage && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => run(
                  () => setNetworkContactVisibility({ contactId: contact.id, visibility: shared ? "private" : "team" }),
                  () => toast.success(shared ? t("visibility.madePrivate") : t("visibility.madeTeam")),
                )}
              >
                {shared ? <Lock className="size-4" /> : <UsersRound className="size-4" />}
                {shared ? t("visibility.makePrivate") : t("visibility.makeTeam")}
              </Button>
            )}
          </div>
        </div>

        {facts.length > 0 && (
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {facts.map((fact) => (
              <div key={fact.label} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{fact.label}</dt>
                <dd className="min-w-0">{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <div>
          <div className="mb-1 text-xs text-muted-foreground">{t("fields.tags")}</div>
          <ContactTagsEditor contactId={contact.id} tags={contact.tags} suggestions={tagSuggestions} canEdit={contact.canEdit} />
        </div>

        {contact.notes && (
          <div>
            <div className="mb-1 text-xs text-muted-foreground">{t("fields.notes")}</div>
            <p className="text-sm whitespace-pre-wrap">{contact.notes}</p>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-medium">{t("contact.leadsTitle")}</h3>
          {contact.canEdit && (
            <Button size="sm" variant="outline" onClick={() => setLeadDialog({ mode: "create", contactId: contact.id })}>
              <Plus className="size-4" />
              {t("lead.add")}
            </Button>
          )}
        </div>
        {contact.leads.length ? (
          <LeadList leads={contact.leads} today={today} onEdit={(lead) => setLeadDialog({ mode: "edit", lead })} />
        ) : (
          <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("contact.noLeads")}</p>
        )}
      </section>

      <ContactLinks contactId={contact.id} links={contact.links} canEdit={contact.canEdit} />

      <InteractionLog contactId={contact.id} interactions={contact.interactions} canEdit={contact.canEdit} today={today} />

      {contact.introducedBy.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-medium">{t("contact.introducedBy")}</h3>
          <LeadList leads={contact.introducedBy} today={today} showContact onEdit={(lead) => setLeadDialog({ mode: "edit", lead })} />
        </section>
      )}

      {contact.canManage && (
        <div className="flex justify-end border-t pt-4">
          <Button variant="destructive" size="sm" disabled={pending} onClick={remove} onBlur={() => setConfirmDelete(false)}>
            <Trash2 className="size-4" />
            {confirmDelete ? t("contact.confirmDelete") : t("contact.delete")}
          </Button>
        </div>
      )}

      <ContactEditDialog contact={contact} organizationNames={organizationNames} open={editing} onClose={() => setEditing(false)} />
      <LeadDialog state={leadDialog} onClose={() => setLeadDialog(null)} contacts={contacts} organizationNames={organizationNames} />
    </div>
  );
}
