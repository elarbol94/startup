"use client";

import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Paperclip, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ShortcutKeys } from "@/components/ui/shortcut-tooltip";
import { parseAddressList } from "../../mail-utils";
import type { MailAccountSummary, MailErrorCode, MailResult } from "../../types";
import type { ComposeDraft } from "./compose-draft";
import { formatBytes } from "./format";

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export function ComposeDialog({ draft, accounts, onClose, onSent }: {
  /** Null when closed. */
  draft: ComposeDraft | null;
  accounts: MailAccountSummary[];
  onClose: () => void;
  onSent: (accountId: string) => void;
}) {
  const [confirmElement, confirm] = useConfirm();
  const t = useTranslations("mail.compose");
  const dirty = useRef(false);

  async function requestClose() {
    if (dirty.current && !(await confirm({ title: t("discardTitle"), description: t("discardDescription"), confirmLabel: t("discard"), destructive: true }))) return;
    dirty.current = false;
    onClose();
  }

  return (
    <>
      <Dialog open={draft !== null} onOpenChange={(open) => { if (!open) void requestClose(); }}>
        {draft ? (
          <ComposeForm
            draft={draft}
            accounts={accounts}
            onDirty={() => { dirty.current = true; }}
            onCancel={() => void requestClose()}
            onSent={(accountId) => { dirty.current = false; onSent(accountId); }}
          />
        ) : null}
      </Dialog>
      {confirmElement}
    </>
  );
}

function ComposeForm({ draft, accounts, onDirty, onCancel, onSent }: {
  draft: ComposeDraft;
  accounts: MailAccountSummary[];
  onDirty: () => void;
  onCancel: () => void;
  onSent: (accountId: string) => void;
}) {
  const t = useTranslations("mail.compose");
  const tErrors = useTranslations("mail.errors");
  const id = useId();
  const [form, setForm] = useState(draft);
  const [showCopies, setShowCopies] = useState(Boolean(draft.cc || draft.bcc));
  const [files, setFiles] = useState<File[]>([]);
  const [forwarded, setForwarded] = useState<number[]>(() => draft.forwardable.map((attachment) => attachment.index));
  const [error, setError] = useState<{ code: MailErrorCode; detail?: string } | null>(null);
  const [sending, setSending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
    + draft.forwardable.filter((attachment) => forwarded.includes(attachment.index)).reduce((sum, attachment) => sum + attachment.size, 0);

  function update<K extends keyof ComposeDraft>(field: K, value: ComposeDraft[K]) {
    onDirty();
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  async function send() {
    if (sending) return;
    setError(null);
    const invalid = [form.to, form.cc, form.bcc].flatMap((value) => parseAddressList(value).invalid);
    if (invalid.length > 0) return setError({ code: "recipient_rejected", detail: invalid.join(", ") });
    if ([form.to, form.cc, form.bcc].every((value) => parseAddressList(value).addresses.length === 0)) {
      return setError({ code: "recipient_rejected", detail: t("noRecipients") });
    }
    if (totalBytes > MAX_ATTACHMENT_BYTES) return setError({ code: "too_large" });
    const body = new FormData();
    body.set("accountId", form.accountId);
    body.set("to", form.to);
    body.set("cc", showCopies ? form.cc : "");
    body.set("bcc", showCopies ? form.bcc : "");
    body.set("subject", form.subject);
    body.set("text", form.text);
    if (form.inReplyTo) body.set("inReplyTo", form.inReplyTo);
    if (form.references) body.set("references", JSON.stringify(form.references));
    if (form.source && form.source.uid) {
      body.set("sourceFolder", form.source.folder);
      body.set("sourceUid", String(form.source.uid));
      body.set("sourceKind", form.source.kind);
    }
    if (forwarded.length > 0) body.set("forwardAttachments", forwarded.join(","));
    for (const file of files) body.append("attachments", file, file.name);

    setSending(true);
    try {
      const response = await fetch("/api/mail/send", { method: "POST", body });
      const result = await response.json().catch(() => ({ ok: false, error: "unknown" })) as MailResult<{ rejected: string[]; filed: boolean }>;
      if (!result.ok) {
        setError({ code: result.error, detail: result.detail });
        return;
      }
      if (result.value.rejected.length > 0) toast.warning(t("partlyRejected", { recipients: result.value.rejected.join(", ") }));
      else toast.success(t("sent"));
      onSent(form.accountId);
    } catch {
      setError({ code: "connection_failed" });
    } finally {
      setSending(false);
    }
  }

  return (
    <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-3 sm:max-w-3xl" showCloseButton={false}>
      <form
        className="flex min-h-0 flex-1 flex-col gap-3"
        onSubmit={(event) => { event.preventDefault(); void send(); }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void send();
          }
        }}
      >
        <DialogHeader className="flex-row items-center justify-between gap-2">
          <DialogTitle>{draft.source?.kind === "forward" ? t("forwardTitle") : draft.source ? t("replyTitle") : t("newTitle")}</DialogTitle>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onCancel} aria-label={t("close")}><X /></Button>
        </DialogHeader>

        <div className="grid grid-cols-[72px_1fr] items-center gap-x-2 gap-y-2 text-sm">
          {accounts.length > 1 ? (
            <>
              <label htmlFor={`${id}-from`} className="text-muted-foreground">{t("from")}</label>
              <select
                id={`${id}-from`}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
                value={form.accountId}
                onChange={(event) => update("accountId", event.target.value)}
                disabled={Boolean(draft.source)}
              >
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.displayName ? `${account.displayName} <${account.emailAddress}>` : account.emailAddress}</option>)}
              </select>
            </>
          ) : null}
          <label htmlFor={`${id}-to`} className="text-muted-foreground">{t("to")}</label>
          <div className="flex items-center gap-2">
            <Input id={`${id}-to`} value={form.to} onChange={(event) => update("to", event.target.value)} autoFocus={!form.to} placeholder={t("recipientsPlaceholder")} />
            {!showCopies ? <Button type="button" variant="ghost" size="sm" onClick={() => setShowCopies(true)}>{t("ccBcc")}</Button> : null}
          </div>
          {showCopies ? (
            <>
              <label htmlFor={`${id}-cc`} className="text-muted-foreground">{t("cc")}</label>
              <Input id={`${id}-cc`} value={form.cc} onChange={(event) => update("cc", event.target.value)} />
              <label htmlFor={`${id}-bcc`} className="text-muted-foreground">{t("bcc")}</label>
              <Input id={`${id}-bcc`} value={form.bcc} onChange={(event) => update("bcc", event.target.value)} />
            </>
          ) : null}
          <label htmlFor={`${id}-subject`} className="text-muted-foreground">{t("subject")}</label>
          <Input id={`${id}-subject`} value={form.subject} maxLength={998} onChange={(event) => update("subject", event.target.value)} />
        </div>

        <Textarea
          aria-label={t("body")}
          className="min-h-[240px] flex-1 resize-none font-[inherit] leading-relaxed"
          value={form.text}
          autoFocus={Boolean(form.to)}
          onChange={(event) => update("text", event.target.value)}
        />

        {draft.forwardable.length > 0 || files.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5" aria-label={t("attachments")}>
            {draft.forwardable.map((attachment) => {
              const included = forwarded.includes(attachment.index);
              return (
                <li key={`fwd-${attachment.index}`}>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
                    <input type="checkbox" checked={included} onChange={() => { onDirty(); setForwarded((list) => (included ? list.filter((value) => value !== attachment.index) : [...list, attachment.index])); }} />
                    <Paperclip className="size-3" />
                    <span className="max-w-[220px] truncate">{attachment.filename}</span>
                    <span className="text-muted-foreground">{formatBytes(attachment.size)}</span>
                  </label>
                </li>
              );
            })}
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`} className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
                <Paperclip className="size-3" />
                <span className="max-w-[220px] truncate">{file.name}</span>
                <span className="text-muted-foreground">{formatBytes(file.size)}</span>
                <button type="button" className="text-muted-foreground hover:text-foreground" aria-label={t("removeAttachment", { name: file.name })} onClick={() => setFiles((list) => list.filter((_, position) => position !== index))}>
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>
              {tErrors(error.code)}
              {error.detail ? <span className="mt-1 block text-[11px] break-all opacity-80">{error.detail}</span> : null}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(event) => {
                const chosen = Array.from(event.target.files ?? []);
                event.target.value = "";
                if (chosen.length === 0) return;
                onDirty();
                setFiles((list) => [...list, ...chosen]);
              }}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}><Paperclip />{t("attach")}</Button>
            {totalBytes > 0 ? (
              <span className={totalBytes > MAX_ATTACHMENT_BYTES ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                {formatBytes(totalBytes)} / {formatBytes(MAX_ATTACHMENT_BYTES)}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:inline"><ShortcutKeys shortcut="Mod+Enter" /></span>
            <Button type="submit" disabled={sending}><Send />{sending ? t("sending") : t("send")}</Button>
          </div>
        </div>
      </form>
    </DialogContent>
  );
}
