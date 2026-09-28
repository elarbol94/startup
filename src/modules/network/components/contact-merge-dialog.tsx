"use client";

import { useMemo, useRef, useState, useTransition } from "react";
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
import { getNetworkContactMergePreview, mergeNetworkContacts } from "../merge-actions";
import type { MergeChoices, MergeContactSummary, NetworkContactMergePreview } from "../merge-fields";
import { findSimilarContacts } from "../network-utils";
import { ContactMergePreview } from "./contact-merge-preview";
import { selectClassName } from "./network-ui";
import { useNetworkAction } from "./use-network-action";

const label = (contact: MergeContactSummary) => (contact.organization ? `${contact.name} · ${contact.organization}` : contact.name);

/**
 * Merges another contact with this one: pick the other person (similar names
 * first), choose which record survives, review what moves and which values
 * to keep, then confirm. Only contacts the viewer manages with the same
 * visibility are offered; the action checks all of it again.
 */
export function ContactMergeDialog({
  contact,
  candidates,
  open,
  onClose,
}: {
  contact: { id: string; name: string; visibility: "private" | "team" };
  candidates: MergeContactSummary[];
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("network");
  const common = useTranslations("common");
  const router = useRouter();
  const { pending, run } = useNetworkAction();
  const [loading, startLoading] = useTransition();
  const [otherId, setOtherId] = useState("");
  const [keepCurrent, setKeepCurrent] = useState(true);
  const [preview, setPreview] = useState<NetworkContactMergePreview | null>(null);
  const [choices, setChoices] = useState<MergeChoices>({});
  const request = useRef(0);

  const similar = useMemo(() => findSimilarContacts(contact.name, candidates).map((match) => match.contact), [candidates, contact.name]);
  const others = useMemo(() => candidates.filter((candidate) => !similar.includes(candidate)), [candidates, similar]);

  function load(nextOtherId: string, nextKeepCurrent: boolean) {
    setOtherId(nextOtherId);
    setKeepCurrent(nextKeepCurrent);
    setPreview(null);
    setChoices({});
    if (!nextOtherId) return;
    const current = ++request.current;
    const pair = nextKeepCurrent ? { keepId: contact.id, mergeId: nextOtherId } : { keepId: nextOtherId, mergeId: contact.id };
    startLoading(async () => {
      try {
        const result = await getNetworkContactMergePreview(pair);
        if (current !== request.current) return;
        if (!result.ok) toast.error(t(`errors.${result.error}`));
        else setPreview(result.preview);
      } catch {
        toast.error(common("error"));
      }
    });
  }

  function close() {
    request.current += 1;
    setOtherId("");
    setKeepCurrent(true);
    setPreview(null);
    setChoices({});
    onClose();
  }

  function confirm() {
    if (!preview || preview.blockers.length) return;
    const { keep, merge } = preview;
    run(
      () => mergeNetworkContacts({ keepId: keep.id, mergeId: merge.id, choices }),
      (result) => {
        toast.success(t("merge.merged", { name: merge.name }));
        close();
        if (result.contactId !== contact.id) router.push(`/network/${result.contactId}`);
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("merge.title")}</DialogTitle>
          <DialogDescription>{t("merge.description", { name: contact.name })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="network-merge-other">{t("merge.other")}</Label>
          <select
            id="network-merge-other"
            className={selectClassName}
            value={otherId}
            disabled={!candidates.length}
            onChange={(event) => load(event.target.value, keepCurrent)}
          >
            <option value="">{t("merge.choose")}</option>
            {similar.length > 0 && (
              <optgroup label={t("merge.similar")}>
                {similar.map((candidate) => <option key={candidate.id} value={candidate.id}>{label(candidate)}</option>)}
              </optgroup>
            )}
            {others.length > 0 && (
              <optgroup label={t("merge.all")}>
                {others.map((candidate) => <option key={candidate.id} value={candidate.id}>{label(candidate)}</option>)}
              </optgroup>
            )}
          </select>
          <p className="text-xs text-muted-foreground">
            {candidates.length ? t(contact.visibility === "team" ? "merge.onlyTeam" : "merge.onlyPrivate") : t("merge.noCandidates")}
          </p>
        </div>
        {otherId && (
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => load(otherId, !keepCurrent)}>
            <ArrowLeftRight className="size-4" />
            {t("merge.swap")}
          </Button>
        )}
        {loading && <p className="text-sm text-muted-foreground" role="status">{t("merge.loading")}</p>}
        {preview && !loading && (
          <ContactMergePreview
            preview={preview}
            choices={choices}
            onChoose={(key, choice) => setChoices((current) => ({ ...current, [key]: choice }))}
          />
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>{t("cancel")}</Button>
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
    </Dialog>
  );
}
