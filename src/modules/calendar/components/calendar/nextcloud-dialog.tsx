"use client";

// Nextcloud two-way sync: connect with an app password, then pick Nextcloud
// calendars to sync into new app calendars. Used by use-calendar-feeds.tsx.
import { useEffect, useState, type FormEvent } from "react";
import { Check, Loader2 } from "lucide-react";
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
import {
  connectNextcloud,
  disconnectNextcloud,
  getNextcloudOverview,
  linkNextcloudCalendar,
  type NextcloudOverview,
} from "../../caldav-actions";
import type { CalendarSource } from "../../types";
import { feedErrorMessage } from "./calendar-feed-dialogs";
import type { CalendarT } from "./sidebar/sidebar-types";

type Overview = Extract<NextcloudOverview, { status: "ok" }>;

const selectClass = "h-9 rounded-lg border bg-popover px-2.5 text-sm";

export function NextcloudDialog({
  open,
  onOpenChange,
  onChanged,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
  t: CalendarT;
}) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [visibility, setVisibility] = useState<CalendarSource["visibility"]>("private");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");

  function apply(result: NextcloudOverview) {
    if (result.status === "ok") {
      setOverview(result);
      setError("");
      return;
    }
    setError(feedErrorMessage(t, result.error));
    // A rejected stored login falls back to the login form.
    setOverview((current) => {
      const base = current ?? { status: "ok" as const, server: "Nextcloud", username: null, calendars: [] };
      return result.error === "auth_failed" ? { ...base, username: null } : base;
    });
  }

  async function load() {
    setPending("load");
    try {
      apply(await getNextcloudOverview());
    } catch {
      setError(feedErrorMessage(t, null));
    } finally {
      setPending(null);
    }
  }

  // Reload each time the dialog opens; state is only set once the answer arrives.
  useEffect(() => {
    if (!open) return;
    let active = true;
    getNextcloudOverview().then(
      (result) => active && apply(result),
      () => active && setError(feedErrorMessage(t, null)),
    );
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply/t are stable for this dialog's purpose
  }, [open]);

  async function run(key: string, action: () => Promise<{ status: string; error?: string } | void>) {
    setPending(key);
    setError("");
    try {
      const result = await action();
      if (result && result.status === "error") {
        setError(feedErrorMessage(t, result.error));
        return false;
      }
      onChanged();
      return true;
    } catch {
      setError(feedErrorMessage(t, null));
      return false;
    } finally {
      setPending(null);
    }
  }

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await run("connect", () => connectNextcloud({ username, password }))) {
      setPassword("");
      await load();
    }
  }

  const connected = Boolean(overview?.username);
  const busy = pending !== null;

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("nextcloud.title")}</DialogTitle>
          <DialogDescription>{t("nextcloud.description", { server: overview?.server ?? "Nextcloud" })}</DialogDescription>
        </DialogHeader>
        {!overview && !error ? (
          <div className="grid place-items-center py-10"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        ) : !connected ? (
          <form id="nextcloud-login" onSubmit={connect} className="mt-5 grid gap-4">
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">{t("nextcloud.appPasswordSteps")}</p>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium">{t("nextcloud.username")}</span>
              <Input required autoComplete="username" spellCheck={false} value={username} onChange={(event) => setUsername(event.target.value)} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium">{t("nextcloud.appPassword")}</span>
              <Input required type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
              <span className="text-[11px] text-muted-foreground">{t("nextcloud.passwordHint")}</span>
            </label>
          </form>
        ) : (
          <div className="mt-5 grid gap-4">
            <p className="text-xs text-muted-foreground">{t("nextcloud.connectedAs", { username: overview!.username! })}</p>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium">{t("nextcloud.newVisibility")}</span>
              <select className={selectClass} value={visibility} onChange={(event) => setVisibility(event.target.value as CalendarSource["visibility"])}>
                <option value="private">{t("calendarPrivate")}</option>
                <option value="busy">{t("calendarBusyOnly")}</option>
                <option value="company">{t("calendarShared")}</option>
              </select>
            </label>
            <ul className="divide-y rounded-lg border">
              {overview!.calendars.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">{t("nextcloud.none")}</li>}
              {overview!.calendars.map((calendar) => (
                <li key={calendar.url} className="flex items-center gap-2.5 px-3 py-2">
                  <span aria-hidden className="size-3 shrink-0 rounded-[4px]" style={{ backgroundColor: calendar.color ?? "#0082C9" }} />
                  <span className="min-w-0 flex-1 truncate text-sm">{calendar.name}</span>
                  {calendar.linked ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Check className="size-3.5" />{t("nextcloud.linked")}</span>
                  ) : !calendar.writable ? (
                    <span className="text-xs text-muted-foreground">{t("nextcloud.readOnly")}</span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={async () => {
                        const ok = await run(calendar.url, () =>
                          linkNextcloudCalendar({ url: calendar.url, name: calendar.name, color: calendar.color ?? "#0082C9", visibility }),
                        );
                        if (ok) setOverview((current) => current && {
                          ...current,
                          calendars: current.calendars.map((entry) => (entry.url === calendar.url ? { ...entry, linked: true } : entry)),
                        });
                      }}
                    >
                      {pending === calendar.url && <Loader2 className="animate-spin" />}
                      {t("nextcloud.link")}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-[11px] leading-relaxed text-muted-foreground">{t("nextcloud.pushHint")}</p>
          </div>
        )}
        {error && <p role="alert" className="mt-3 text-xs text-destructive">{error}</p>}
        <DialogFooter className="mt-5">
          {connected ? (
            <>
              <Button
                type="button"
                variant="ghost"
                className="mr-auto text-muted-foreground"
                disabled={busy}
                onClick={async () => {
                  if (await run("disconnect", disconnectNextcloud)) setOverview((current) => current && { ...current, username: null, calendars: [] });
                }}
              >
                {t("nextcloud.disconnect")}
              </Button>
              <Button type="button" disabled={busy} onClick={() => onOpenChange(false)}>{t("done")}</Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
              <Button type="submit" form="nextcloud-login" disabled={busy || !username.trim() || !password}>
                {pending === "connect" && <Loader2 className="animate-spin" />}
                {t("nextcloud.connect")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
