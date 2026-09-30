"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { setLocale } from "@/i18n/actions";
import { locales, type Locale } from "@/i18n/config";
import { IDENTITY_CHANGED } from "@/components/user-identity";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MIN_PASSWORD_LENGTH = 8;

export function AccountForm({ userId, name, email }: { userId: string; name: string; email: string }) {
  const t = useTranslations("settings.account");
  const tLang = useTranslations("settings.language");
  const locale = useLocale();
  const router = useRouter();
  const [displayName, setDisplayName] = useState(name);
  const [savingName, startNameTransition] = useTransition();
  const [switchingLocale, startLocaleTransition] = useTransition();
  const [savingPassword, startPasswordTransition] = useTransition();
  const [passwordError, setPasswordError] = useState<string | null>(null);

  function saveName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = displayName.trim();
    if (!next) {
      toast.error(t("nameRequired"));
      return;
    }
    startNameTransition(async () => {
      const { error } = await authClient.updateUser({ name: next });
      if (error) {
        toast.error(error.message ?? t("nameRequired"));
        return;
      }
      window.dispatchEvent(new CustomEvent(IDENTITY_CHANGED, { detail: { id: userId, name: next } }));
      toast.success(t("nameSaved"));
      router.refresh();
    });
  }

  function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get("currentPassword") ?? "");
    const newPassword = String(data.get("newPassword") ?? "");
    const confirmPassword = String(data.get("confirmPassword") ?? "");
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(t("passwordTooShort"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t("passwordMismatch"));
      return;
    }
    setPasswordError(null);
    startPasswordTransition(async () => {
      const { error } = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (error) {
        setPasswordError(t("passwordFailed"));
        return;
      }
      form.reset();
      toast.success(t("passwordSaved"));
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <form onSubmit={saveName} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="account-name">{t("name")}</Label>
            <div className="flex gap-2">
              <Input
                id="account-name"
                name="name"
                autoComplete="name"
                value={displayName}
                maxLength={120}
                required
                onChange={(event) => setDisplayName(event.target.value)}
              />
              <Button
                type="submit"
                variant="outline"
                disabled={savingName || displayName.trim() === name || !displayName.trim()}
              >
                {t("saveName")}
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="account-email">{t("email")}</Label>
            <Input id="account-email" value={email} readOnly disabled />
          </div>
        </form>

        <fieldset disabled={switchingLocale}>
          <legend className="mb-2 text-sm font-medium">{tLang("label")}</legend>
          <div className="flex flex-wrap gap-2">
            {locales.map((code) => (
              <label
                key={code}
                className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-accent has-focus-visible:ring-2 has-focus-visible:ring-ring"
              >
                <input
                  type="radio"
                  name="account-locale"
                  value={code}
                  checked={locale === code}
                  onChange={() => startLocaleTransition(() => setLocale(code as Locale))}
                  className="size-4 accent-primary"
                />
                {tLang(code)}
              </label>
            ))}
          </div>
        </fieldset>

        <form onSubmit={changePassword} className="flex flex-col gap-3 border-t pt-5" noValidate>
          <div>
            <h3 className="text-sm font-medium">{t("password")}</h3>
            <p className="text-xs text-muted-foreground">{t("passwordHint")}</p>
          </div>
          {/* Hidden username lets password managers associate the new password with this account. */}
          <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="current-password">{t("currentPassword")}</Label>
              <Input id="current-password" name="currentPassword" type="password" autoComplete="current-password" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">{t("newPassword")}</Label>
              <Input id="new-password" name="newPassword" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">{t("confirmPassword")}</Label>
              <Input id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
            </div>
          </div>
          {passwordError ? (
            <p role="alert" className="text-sm text-destructive">{passwordError}</p>
          ) : null}
          <div>
            <Button type="submit" variant="outline" disabled={savingPassword}>
              {t("password")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
