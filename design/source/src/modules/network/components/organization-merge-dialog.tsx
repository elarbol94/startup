"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { findSimilarContacts } from "../network-utils";
import { getNetworkOrganizationMergePreview, mergeNetworkOrganizations } from "../organization-merge-actions";
import type { NetworkOrganizationMergePreview, OrganizationClash, OrganizationMergeChoices } from "../organization-merge-fields";
import { selectClassName } from "./network-ui";
import { OrganizationMergePreview } from "./organization-merge-preview";
import { useNetworkAction } from "./use-network-action";

/** Where the dialog starts: nothing chosen, or (after a rename clash) the clashing organisation, kept. */
export type OrganizationMergeStart = { other: OrganizationClash; keepCurrent: boolean } | null;

/**
 * Merges another organisation with this one (admins only; the actions check
 * again): pick the other organisation (similar names first), choose which one
 * survives, review the counts and conflicting values, then confirm.
 */
export function OrganizationMergeDialog({
  organization,
  candidates,
  open,
  start,
  onClose,
}: {
  organization: OrganizationClash;
  candidates: OrganizationClash[];
  open: boolean;
  start: OrganizationMergeStart;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      {open && <OrganizationMergeContent organization={organization} candidates={candidates} start={start} onClose={onClose} />}
    </Dialog>
  );
}

function OrganizationMergeContent({
  organization,
  candidates,
  start,
  onClose,
}: {
  organization: OrganizationClash;
  candidates: OrganizationClash[];
  start: OrganizationMergeStart;
  onClose: () => void;
}) {
  const t = useTranslations("network");
  const common = useTranslations("common");
  const router = useRouter();
  const { pending, run } = useNetworkAction();
  const [loading, startLoading] = useTransition();
  const [otherId, setOtherId] = useState(start?.other.id ?? "");
  const [keepCurrent, setKeepCurrent] = useState(start?.keepCurrent ?? true);
  const [preview, setPreview] = useState<NetworkOrganizationMergePreview | null>(null);
  const [choices, setChoices] = useState<OrganizationMergeChoices>({});
  const request = useRef(0);

  // A clashing organisation the admin cannot otherwise see is still offered.
  const options = useMemo(
    () => (start && !candidates.some((candidate) => candidate.id === start.other.id) ? [start.other, ...candidates] : candidates),
    [candidates, start],
  );
  const similar = useMemo(() => findSimilarContacts(organization.name, options).map((match) => match.contact), [options, organization.name]);
  const others = useMemo(() => options.filter((option) => !similar.includes(option)), [options, similar]);

  function fetchPreview(nextOtherId: string, nextKeepCurrent: boolean) {
    const current = ++request.current;
    const pair = nextKeepCurrent ? { keepId: organization.id, mergeId: nextOtherId } : { keepId: nextOtherId, mergeId: organization.id };
    startLoading(async () => {
      try {
        const result = await getNetworkOrganizationMergePreview(pair);
        if (current !== request.current) return;
        if (!result.ok) toast.error(t(`errors.${result.error}`));
        else setPreview(result.preview);
      } catch {
        toast.error(common("error"));
      }
    });
  }

  // Opened from a rename clash: show that pair straight away.
  const initial = useRef(start);
  useEffect(() => {
    if (initial.current) fetchPreview(initial.current.other.id, initial.current.keepCurrent);
    // Runs once on open; later changes go through `select`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function select(nextOtherId: string, nextKeepCurrent: boolean) {
    request.current += 1;
    setOtherId(nextOtherId);
    setKeepCurrent(nextKeepCurrent);
    setPreview(null);
    setChoices({});
    if (nextOtherId) fetchPreview(nextOtherId, nextKeepCurrent);
  }

  function confirm() {
    if (!preview || preview.blockers.length) return;
    const { keep, merge } = preview;
    run(
      () => mergeNetworkOrganizations({ keepId: keep.id, mergeId: merge.id, choices }),
      (result) => {
        toast.success(t("organizationMerge.merged", { name: merge.name }));
        onClose();
        if (result.organizationId === organization.id) return;
        router.push(result.visible ? `/network/organizations/${result.organizationId}` : "/network/organizations");
      },
    );
  }

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{t("organizationMerge.title")}</DialogTitle>
        <DialogDescription>{t("organizationMerge.description", { name: organization.name })}</DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5">
        <Label htmlFor="network-organization-merge-other">{t("organizationMerge.other")}</Label>
        <select
          id="network-organization-merge-other"
          className={selectClassName}
          value={otherId}
          disabled={!options.length}
          onChange={(event) => select(event.target.value, keepCurrent)}
        >
          <option value="">{t("organizationMerge.choose")}</option>
          {similar.length > 0 && (
            <optgroup label={t("organizationMerge.similar")}>
              {similar.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </optgroup>
          )}
          {others.length > 0 && (
            <optgroup label={t("organizationMerge.all")}>
              {others.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </optgroup>
          )}
        </select>
        {!options.length && <p className="text-xs text-muted-foreground">{t("organizationMerge.noCandidates")}</p>}
      </div>
      {otherId && (
        <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => select(otherId, !keepCurrent)}>
          <ArrowLeftRight className="size-4" />
          {t("merge.swap")}
        </Button>
      )}
      {loading && <p className="text-sm text-muted-foreground" role="status">{t("merge.loading")}</p>}
      {preview && !loading && (
        <OrganizationMergePreview
          preview={preview}
          choices={choices}
          onChoose={(key, choice) => setChoices((current) => ({ ...current, [key]: choice }))}
        />
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>{t("cancel")}</Button>
        <Button
          type="button"
          variant="destructive"
          disabled={pending || loading || !preview || preview.blockers.length > 0}
          onClick={confirm}
        >
          {t("merge.confirm")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
