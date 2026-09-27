"use client";

import { useMemo, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { cn } from "@/lib/utils";
import { quickCaptureContact } from "../contact-actions";
import { leadKinds } from "../constants";
import { normalizeText, type Suggestion } from "../network-utils";
import type { NetworkContactOption } from "../queries";

export type QuickCaptureOptions = { contacts: NetworkContactOption[]; tags: Suggestion[]; metContexts: Suggestion[] };
import { MunicipalityPicker } from "./municipality-picker";
import type { CaptureDraft } from "./quick-capture-draft";
import { selectClassName } from "./network-ui";
import { SuggestInput } from "./suggest-input";
import { PopularTags, TagInput } from "./tag-input";
import { useNetworkAction } from "./use-network-action";

const NEW_CONTACT = "new";

/**
 * The 20-second capture after a conversation: who, what they said, a few
 * tags. Typing a known name offers to add to that contact instead of creating
 * a duplicate. Closing keeps the draft (see useCaptureDraft); only saving or
 * discarding clears it.
 */
export function QuickCaptureDialog({
  open,
  onClose,
  draft,
  showDraftHint,
  onDiscard,
  options,
}: {
  open: boolean;
  onClose: () => void;
  draft: CaptureDraft;
  /** The dialog continues a draft from earlier. */
  showDraftHint: boolean;
  onDiscard: () => void;
  options: QuickCaptureOptions;
}) {
  const t = useTranslations("network");
  const router = useRouter();
  const { pending, run } = useNetworkAction();
  const { form, setForm, clear, hasDraft } = draft;
  const { contacts, tags, metContexts } = options;

  const matches = useMemo(() => {
    const key = normalizeText(form.name);
    return key ? contacts.filter((contact) => normalizeText(contact.name) === key) : [];
  }, [contacts, form.name]);
  // Default to the first matching contact; "new" only when chosen explicitly.
  const target = matches.some((contact) => contact.id === form.target) || form.target === NEW_CONTACT
    ? form.target
    : matches[0]?.id ?? NEW_CONTACT;
  const existingId = target === NEW_CONTACT ? null : target;


  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!form.name.trim() || pending) return;
    const name = existingId ? matches.find((contact) => contact.id === existingId)?.name ?? form.name : form.name.trim();
    run(
      () => quickCaptureContact({
        contactId: existingId,
        name: form.name,
        note: form.note,
        kind: form.kind,
        metContext: existingId ? "" : form.metContext,
        tags: form.tags,
        metToday: form.metToday,
        municipalityCode: existingId ? null : form.municipality?.code ?? null,
      }),
      (result) => {
        toast.success(t("quick.saved", { name }), {
          action: { label: t("quick.open"), onClick: () => router.push(`/network/${result.contactId}`) },
        });
        clear();
        onClose();
      },
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{t("quick.title")}</DialogTitle>
              <DialogDescription>{t("quick.description")}</DialogDescription>
            </DialogHeader>
            {showDraftHint && hasDraft && (
              <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground" role="status">
                {t("quick.draftRestored")}
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="network-quick-name">{t("fields.name")}</Label>
              <Input
                id="network-quick-name"
                list="network-contact-names"
                autoComplete="off"
                autoFocus
                required
                maxLength={160}
                value={form.name}
                placeholder={t("quick.namePlaceholder")}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value, target: "" }))}
              />
              <datalist id="network-contact-names">
                {[...new Set(contacts.map((contact) => contact.name))].map((name) => <option key={name} value={name} />)}
              </datalist>
              {matches.length > 0 && (
                <select
                  aria-label={t("quick.target")}
                  className={selectClassName}
                  value={target}
                  onChange={(event) => setForm((current) => ({ ...current, target: event.target.value }))}
                >
                  {matches.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {t("quick.addTo", { name: contact.organization ? `${contact.name} · ${contact.organization}` : contact.name })}
                    </option>
                  ))}
                  <option value={NEW_CONTACT}>{t("quick.createNew")}</option>
                </select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="network-quick-note">{t("quick.note")}</Label>
              <Textarea
                id="network-quick-note"
                rows={3}
                maxLength={1000}
                value={form.note}
                placeholder={t("quick.notePlaceholder")}
                onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit();
                }}
              />
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("fields.kind")}>
                {leadKinds.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    aria-pressed={form.kind === kind}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                      form.kind === kind ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                    )}
                    onClick={() => setForm((current) => ({ ...current, kind }))}
                  >
                    {t(`kinds.${kind}`)}
                  </button>
                ))}
              </div>
            </div>
            {!existingId && (
              <div className="space-y-1.5">
                <Label htmlFor="network-quick-context">{t("fields.metContext")}</Label>
                <SuggestInput
                  id="network-quick-context"
                  maxLength={300}
                  value={form.metContext}
                  suggestions={metContexts}
                  placeholder={t("fields.metContextPlaceholder")}
                  onChange={(metContext) => setForm((current) => ({ ...current, metContext }))}
                />
              </div>
            )}
            {!existingId && (
              <div className="space-y-1.5">
                <Label htmlFor="network-quick-municipality">{t("fields.municipality")}</Label>
                <MunicipalityPicker id="network-quick-municipality" value={form.municipality} onChange={(municipality) => setForm((current) => ({ ...current, municipality }))} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="network-quick-tags">{t("fields.tags")}</Label>
              <TagInput id="network-quick-tags" value={form.tags} suggestions={tags} onChange={(next) => setForm((current) => ({ ...current, tags: next }))} />
              <PopularTags value={form.tags} suggestions={tags} onChange={(next) => setForm((current) => ({ ...current, tags: next }))} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.metToday} onCheckedChange={(checked) => setForm((current) => ({ ...current, metToday: checked === true }))} />
              {t("quick.metToday")}
            </label>
            <p className="text-xs text-muted-foreground">{existingId ? t("quick.existingHint") : t("quick.privateHint")}</p>
            <DialogFooter>
              {hasDraft && (
                <Button type="button" variant="ghost" className="text-muted-foreground sm:mr-auto" onClick={onDiscard}>
                  {t("quick.discard")}
                </Button>
              )}
              <Button type="button" variant="outline" onClick={onClose}>{t("quick.close")}</Button>
              <Button type="submit" disabled={pending || !form.name.trim()}>{t("quick.save")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
