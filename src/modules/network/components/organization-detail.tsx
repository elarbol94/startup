"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, Building2, Globe, Lock, MapPin, Merge, Pencil, UsersRound } from "lucide-react";
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
import { updateNetworkOrganization } from "../organization-actions";
import type { OrganizationClash } from "../organization-merge-fields";
import type { NetworkOrganizationDetail } from "../organization-queries";
import type { NetworkContactOption } from "../queries";
import { LeadDialog, type LeadDialogState } from "./lead-dialog";
import { LeadList } from "./lead-list";
import { MunicipalityLink } from "./municipality-link";
import { MunicipalityPicker, type MunicipalityValue } from "./municipality-picker";
import { OrganizationMergeDialog, type OrganizationMergeStart } from "./organization-merge-dialog";
import { useNetworkAction } from "./use-network-action";

export function OrganizationDetail({
  organization,
  contacts,
  organizationNames,
  today,
  mergeCandidates,
}: {
  organization: NetworkOrganizationDetail;
  contacts: NetworkContactOption[];
  organizationNames: string[];
  today: string;
  /** Organisations to merge with; null unless the viewer is an admin. */
  mergeCandidates: OrganizationClash[] | null;
}) {
  const t = useTranslations("network");
  const [editing, setEditing] = useState(false);
  const [leadDialog, setLeadDialog] = useState<LeadDialogState>(null);
  const [merging, setMerging] = useState<{ start: OrganizationMergeStart } | null>(null);

  return (
    <div className="space-y-4" data-testid="network-organization-detail">
      <Link href="/network/organizations" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        {t("organizations.back")}
      </Link>

      <section className="space-y-3 rounded-2xl border bg-card p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="flex min-w-0 items-center gap-2 text-xl font-semibold tracking-tight">
            <Building2 className="size-5 shrink-0 text-muted-foreground" />
            <span className="truncate">{organization.name}</span>
          </h2>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            {mergeCandidates && (
              <Button size="sm" variant="outline" data-testid="network-organization-merge-open" onClick={() => setMerging({ start: null })}>
                <Merge className="size-4" />
                {t("organizationMerge.open")}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="size-4" />
              {t("contact.edit")}
            </Button>
          </div>
        </div>
        {organization.municipalityCode && (
          <p className="inline-flex items-center gap-1.5 text-sm">
            <MapPin className="size-4 shrink-0 text-muted-foreground" />
            <MunicipalityLink code={organization.municipalityCode} name={organization.municipalityName ?? organization.municipalityCode} />
          </p>
        )}
        {organization.website && (
          <a href={organization.website} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 text-sm break-all underline-offset-4 hover:underline">
            <Globe className="size-4 shrink-0 text-muted-foreground" />
            {organization.website.replace(/^https?:\/\/(www\.)?/, "")}
          </a>
        )}
        {organization.notes && <p className="text-sm whitespace-pre-wrap">{organization.notes}</p>}
        <p className="text-xs text-muted-foreground">{t("organizations.sharedHint")}</p>
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">{t("organizations.peopleTitle")}</h3>
        {organization.people.length ? (
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
            {organization.people.map((person) => (
              <li key={person.id}>
                <Link href={`/network/${person.id}`} className="flex items-center gap-2 px-4 py-3 text-sm hover:bg-muted/50">
                  <span className="font-medium">{person.name}</span>
                  {person.visibility === "private"
                    ? <Lock className="size-3.5 text-muted-foreground" aria-label={t("visibility.private")} />
                    : <UsersRound className="size-3.5 text-muted-foreground" aria-label={t("visibility.team")} />}
                  {person.role && <span className="text-muted-foreground">· {person.role}</span>}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("organizations.noPeople")}</p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">{t("organizations.introsTitle")}</h3>
        {organization.introductions.length ? (
          <LeadList leads={organization.introductions} today={today} showContact onEdit={(lead) => setLeadDialog({ mode: "edit", lead })} />
        ) : (
          <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("organizations.noIntros")}</p>
        )}
      </section>

      <OrganizationEditDialog
        organization={organization}
        open={editing}
        onClose={() => setEditing(false)}
        // After a rename clash: keep the existing organisation, since its name is the one wanted.
        onMerge={mergeCandidates ? (clash) => { setEditing(false); setMerging({ start: { other: clash, keepCurrent: false } }); } : undefined}
      />
      {mergeCandidates && (
        <OrganizationMergeDialog
          organization={{ id: organization.id, name: organization.name }}
          candidates={mergeCandidates}
          open={merging !== null}
          start={merging?.start ?? null}
          onClose={() => setMerging(null)}
        />
      )}
      <LeadDialog state={leadDialog} onClose={() => setLeadDialog(null)} contacts={contacts} organizationNames={organizationNames} />
    </div>
  );
}

function OrganizationEditDialog({
  organization,
  open,
  onClose,
  onMerge,
}: {
  organization: NetworkOrganizationDetail;
  open: boolean;
  onClose: () => void;
  onMerge?: (clash: OrganizationClash) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {open && <OrganizationForm organization={organization} onClose={onClose} onMerge={onMerge} />}
    </Dialog>
  );
}

function OrganizationForm({
  organization,
  onClose,
  onMerge,
}: {
  organization: NetworkOrganizationDetail;
  onClose: () => void;
  onMerge?: (clash: OrganizationClash) => void;
}) {
  const t = useTranslations("network");
  const id = useId();
  const { pending, run } = useNetworkAction();
  // Only admins get this back from the action (see updateNetworkOrganization).
  const [clash, setClash] = useState<OrganizationClash | null>(null);
  const [form, setForm] = useState<{ name: string; website: string; notes: string; municipality: MunicipalityValue }>({
    name: organization.name,
    website: organization.website,
    notes: organization.notes,
    municipality: organization.municipalityCode
      ? { code: organization.municipalityCode, name: organization.municipalityName ?? organization.municipalityCode }
      : null,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setClash(null);
    run(async () => {
      const result = await updateNetworkOrganization({
        id: organization.id,
        name: form.name,
        website: form.website,
        notes: form.notes,
        municipalityCode: form.municipality?.code ?? null,
      });
      if (!result.ok && "clash" in result) setClash(result.clash);
      return result;
    }, () => {
      toast.success(t("organizations.saved"));
      onClose();
    });
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <form onSubmit={submit} className="space-y-4">
        <DialogHeader>
          <DialogTitle>{t("organizations.editTitle")}</DialogTitle>
          <DialogDescription>{t("organizations.editDescription")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-name`}>{t("fields.name")}</Label>
          <Input id={`${id}-name`} required maxLength={160} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-website`}>{t("fields.website")}</Label>
          <Input id={`${id}-website`} type="url" maxLength={500} placeholder="https://…" value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-municipality`}>{t("fields.organizationMunicipality")}</Label>
          <MunicipalityPicker id={`${id}-municipality`} value={form.municipality} onChange={(municipality) => setForm({ ...form, municipality })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-notes`}>{t("fields.notes")}</Label>
          <Textarea id={`${id}-notes`} rows={4} maxLength={20000} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </div>
        {clash && onMerge && (
          <div className="space-y-2 rounded-lg border px-3 py-2 text-sm" role="status" data-testid="network-organization-clash">
            <p>{t("organizationMerge.clashHint", { name: clash.name })}</p>
            <Button type="button" size="sm" variant="outline" onClick={() => onMerge(clash)}>
              <Merge className="size-4" />
              {t("organizationMerge.clashMerge", { name: clash.name })}
            </Button>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>{t("cancel")}</Button>
          <Button type="submit" disabled={pending || !form.name.trim()}>{t("save")}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
