"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { quickCaptureContact } from "../contact-actions";
import { leadKinds, type LeadKind } from "../constants";
import { normalizeText, parseTagInput } from "../network-utils";
import type { NetworkContactOption } from "../queries";
import { selectClassName } from "./network-ui";
import { TagSuggestions } from "./tag-suggestions";
import { useNetworkAction } from "./use-network-action";

type FormState = { name: string; target: string; note: string; kind: LeadKind; metContext: string; tags: string };
const emptyForm: FormState = { name: "", target: "", note: "", kind: "info", metContext: "", tags: "" };
const NEW_CONTACT = "new";

/**
 * The 20-second capture after a conversation: who, what they said, a few
 * tags. Typing a known name offers to add to that contact instead of creating
 * a duplicate.
 */
export function QuickCaptureDialog({ contacts, tags }: { contacts: NetworkContactOption[]; tags: string[] }) {
  const t = useTranslations("network");
  const router = useRouter();
  const { pending, run } = useNetworkAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const matches = useMemo(() => {
    const key = normalizeText(form.name);
    return key ? contacts.filter((contact) => normalizeText(contact.name) === key) : [];
  }, [contacts, form.name]);
  // Default to the first matching contact; "new" only when chosen explicitly.
  const target = matches.some((contact) => contact.id === form.target) || form.target === NEW_CONTACT
    ? form.target
    : matches[0]?.id ?? NEW_CONTACT;
  const existingId = target === NEW_CONTACT ? null : target;

  function close() {
    setOpen(false);
    setForm(emptyForm);
  }

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
        tags: parseTagInput(form.tags),
      }),
      (result) => {
        toast.success(t("quick.saved", { name }), {
          action: { label: t("quick.open"), onClick: () => router.push(`/network/${result.contactId}`) },
        });
        close();
      },
    );
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} data-testid="network-quick-capture">
        <Plus className="size-4" />
        {t("quick.button")}
      </Button>
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{t("quick.title")}</DialogTitle>
              <DialogDescription>{t("quick.description")}</DialogDescription>
            </DialogHeader>
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
                onChange={(event) => setForm({ ...form, name: event.target.value, target: "" })}
              />
              <datalist id="network-contact-names">
                {[...new Set(contacts.map((contact) => contact.name))].map((name) => <option key={name} value={name} />)}
              </datalist>
              {matches.length > 0 && (
                <select
                  aria-label={t("quick.target")}
                  className={selectClassName}
                  value={target}
                  onChange={(event) => setForm({ ...form, target: event.target.value })}
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
                onChange={(event) => setForm({ ...form, note: event.target.value })}
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
                    onClick={() => setForm({ ...form, kind })}
                  >
                    {t(`kinds.${kind}`)}
                  </button>
                ))}
              </div>
            </div>
            {!existingId && (
              <div className="space-y-1.5">
                <Label htmlFor="network-quick-context">{t("fields.metContext")}</Label>
                <Input
                  id="network-quick-context"
                  maxLength={300}
                  value={form.metContext}
                  placeholder={t("fields.metContextPlaceholder")}
                  onChange={(event) => setForm({ ...form, metContext: event.target.value })}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="network-quick-tags">{t("fields.tags")}</Label>
              <Input
                id="network-quick-tags"
                autoComplete="off"
                value={form.tags}
                placeholder={t("tags.placeholder")}
                onChange={(event) => setForm({ ...form, tags: event.target.value })}
              />
              <TagSuggestions value={form.tags} suggestions={tags} onChange={(tagsValue) => setForm({ ...form, tags: tagsValue })} />
            </div>
            <p className="text-xs text-muted-foreground">{existingId ? t("quick.existingHint") : t("quick.privateHint")}</p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>{t("cancel")}</Button>
              <Button type="submit" disabled={pending || !form.name.trim()}>{t("quick.save")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
