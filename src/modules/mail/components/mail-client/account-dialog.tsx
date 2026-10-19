"use client";

import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createMailAccount, updateMailAccount } from "../../account-actions";
import { guessMailServer, HETZNER_WEBHOSTING } from "../../presets";
import type { SmtpSecurity } from "../../schema";
import type { MailAccountSummary, MailErrorCode } from "../../types";

type FormState = {
  emailAddress: string;
  displayName: string;
  username: string;
  password: string;
  imapHost: string;
  imapPort: string;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: string;
  smtpSecurity: SmtpSecurity;
  signature: string;
};

function initialState(account: MailAccountSummary | null, defaultName: string): FormState {
  if (account) {
    return { ...account, imapPort: String(account.imapPort), smtpPort: String(account.smtpPort), password: "" };
  }
  const preset = HETZNER_WEBHOSTING;
  return {
    emailAddress: "", displayName: defaultName, username: "", password: "",
    imapHost: preset.imapHost, imapPort: String(preset.imapPort), imapSecure: preset.imapSecure,
    smtpHost: preset.smtpHost, smtpPort: String(preset.smtpPort), smtpSecurity: preset.smtpSecurity, signature: "",
  };
}

export function AccountDialog({ open, onOpenChange, account, defaultName, onSaved }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null to connect a new mailbox. */
  account: MailAccountSummary | null;
  defaultName: string;
  onSaved: (account: MailAccountSummary) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <AccountForm key={account?.id ?? "new"} account={account} defaultName={defaultName} onSaved={onSaved} onCancel={() => onOpenChange(false)} /> : null}
    </Dialog>
  );
}

function AccountForm({ account, defaultName, onSaved, onCancel }: {
  account: MailAccountSummary | null;
  defaultName: string;
  onSaved: (account: MailAccountSummary) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("mail.account");
  const tErrors = useTranslations("mail.errors");
  const id = useId();
  const [form, setForm] = useState(() => initialState(account, defaultName));
  const [advanced, setAdvanced] = useState(Boolean(account));
  const [note, setNote] = useState<"appPassword" | "oauthOnly" | "hetzner" | null>(account ? null : "hetzner");
  const [error, setError] = useState<{ code: MailErrorCode; detail?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof FormState>(field: K, value: FormState[K]) => setForm((previous) => ({ ...previous, [field]: value }));

  // Fill in the provider's servers once the address is complete, unless the user already edited them.
  function applyAddress(emailAddress: string) {
    if (account) return;
    const guess = guessMailServer(emailAddress);
    setNote(guess.note ?? null);
    setForm((previous) => ({
      ...previous,
      username: previous.username && previous.username !== previous.emailAddress ? previous.username : emailAddress,
      imapHost: guess.imapHost, imapPort: String(guess.imapPort), imapSecure: guess.imapSecure,
      smtpHost: guess.smtpHost, smtpPort: String(guess.smtpPort), smtpSecurity: guess.smtpSecurity,
    }));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const input = { ...form, imapPort: Number(form.imapPort), smtpPort: Number(form.smtpPort) };
    startTransition(async () => {
      try {
        const result = account ? await updateMailAccount(account.id, input) : await createMailAccount(input);
        if (result.ok) onSaved(result.value);
        else setError({ code: result.error, detail: result.detail });
      } catch {
        setError({ code: "unknown" });
      }
    });
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <form onSubmit={submit} className="space-y-4">
        <DialogHeader>
          <DialogTitle>{account ? t("editTitle") : t("addTitle")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`${id}-email`}>{t("emailAddress")}</Label>
            <Input
              id={`${id}-email`} type="email" required autoFocus={!account} autoComplete="email" maxLength={254}
              value={form.emailAddress}
              onChange={(event) => set("emailAddress", event.target.value)}
              onBlur={(event) => { if (event.target.value.includes("@")) applyAddress(event.target.value.trim()); }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-name`}>{t("displayName")}</Label>
            <Input id={`${id}-name`} value={form.displayName} maxLength={120} onChange={(event) => set("displayName", event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-password`}>{t("password")}</Label>
            <Input
              id={`${id}-password`} type="password" autoComplete="new-password" required={!account} maxLength={1000}
              placeholder={account ? t("passwordUnchanged") : undefined}
              value={form.password} onChange={(event) => set("password", event.target.value)}
            />
          </div>
        </div>

        {note ? <p className="text-xs text-muted-foreground">{t(`notes.${note}`)}</p> : null}

        <button type="button" className="text-xs font-medium text-primary underline-offset-4 hover:underline" onClick={() => setAdvanced((value) => !value)} aria-expanded={advanced}>
          {advanced ? t("hideServers") : t("showServers")}
        </button>

        {advanced ? (
          <fieldset className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_88px_120px]">
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor={`${id}-username`}>{t("username")}</Label>
              <Input id={`${id}-username`} required value={form.username} maxLength={254} onChange={(event) => set("username", event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-imap-host`}>{t("imapHost")}</Label>
              <Input id={`${id}-imap-host`} required value={form.imapHost} onChange={(event) => set("imapHost", event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-imap-port`}>{t("port")}</Label>
              <Input id={`${id}-imap-port`} required inputMode="numeric" value={form.imapPort} onChange={(event) => set("imapPort", event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-imap-security`}>{t("security")}</Label>
              <select
                id={`${id}-imap-security`}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
                value={form.imapSecure ? "tls" : "starttls"}
                onChange={(event) => set("imapSecure", event.target.value === "tls")}
              >
                <option value="tls">SSL/TLS</option>
                <option value="starttls">STARTTLS</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-smtp-host`}>{t("smtpHost")}</Label>
              <Input id={`${id}-smtp-host`} required value={form.smtpHost} onChange={(event) => set("smtpHost", event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-smtp-port`}>{t("port")}</Label>
              <Input id={`${id}-smtp-port`} required inputMode="numeric" value={form.smtpPort} onChange={(event) => set("smtpPort", event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-smtp-security`}>{t("security")}</Label>
              <select
                id={`${id}-smtp-security`}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
                value={form.smtpSecurity}
                onChange={(event) => set("smtpSecurity", event.target.value as SmtpSecurity)}
              >
                <option value="tls">SSL/TLS</option>
                <option value="starttls">STARTTLS</option>
              </select>
            </div>
          </fieldset>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor={`${id}-signature`}>{t("signature")}</Label>
          <Textarea id={`${id}-signature`} rows={3} maxLength={4000} value={form.signature} onChange={(event) => set("signature", event.target.value)} />
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>
              {tErrors(error.code)}
              {error.detail ? <span className="mt-1 block font-mono text-[11px] break-all opacity-80">{error.detail}</span> : null}
            </AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>{t("cancel")}</Button>
          <Button type="submit" disabled={pending}>{pending ? t("checking") : account ? t("save") : t("connect")}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
