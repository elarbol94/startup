"use client";

// Dialogs for external calendars: subscribing to a Google Calendar (iCal) feed and
// importing an .ics/.zip export once. Used by use-calendar-feeds.tsx.
import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { ColorPicker } from "@/components/ui/color-picker";
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
import { subscribeToCalendarFeed } from "../../subscription-actions";
import type { CalendarSource } from "../../types";

type T = ReturnType<typeof useTranslations<"calendar">>;

const feedErrors = [
  "invalid_url",
  "private_url",
  "too_large",
  "http_error",
  "not_calendar",
  "fetch_failed",
  "already_subscribed",
  "forbidden",
] as const;

export function feedErrorMessage(t: T, code: string | null | undefined) {
  const known = feedErrors.find((error) => error === code);
  return t(`feeds.errors.${known ?? "unknown"}`);
}

const selectClass = "h-9 rounded-lg border bg-background px-2.5 text-sm";

export function SubscribeCalendarDialog({
  open,
  onOpenChange,
  onSubscribed,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubscribed: (created: number) => void;
  t: T;
}) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState("#4285F4");
  const [visibility, setVisibility] = useState<CalendarSource["visibility"]>("private");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  function close(next: boolean) {
    if (pending) return;
    if (!next) {
      setUrl("");
      setName("");
      setError("");
    }
    onOpenChange(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const result = await subscribeToCalendarFeed({ url, name, color, visibility });
      if (result.status === "error") {
        setError(feedErrorMessage(t, result.error));
        return;
      }
      setUrl("");
      setName("");
      onSubscribed(result.created);
    } catch {
      setError(feedErrorMessage(t, null));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{t("feeds.subscribeTitle")}</DialogTitle>
            <DialogDescription>{t("feeds.subscribeDescription")}</DialogDescription>
          </DialogHeader>
          <div className="mt-5 grid gap-4">
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              {t("feeds.subscribeSteps")}
            </p>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium">{t("feeds.feedUrl")}</span>
              <Input
                required
                type="text"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder={t("feeds.feedUrlPlaceholder")}
              />
              <span className="text-[11px] text-muted-foreground">{t("feeds.secretHint")}</span>
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium">{t("feeds.name")}</span>
              <Input
                value={name}
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("feeds.namePlaceholder")}
              />
            </label>
            <div className="grid grid-cols-[auto_1fr] gap-4">
              <label className="grid gap-1.5">
                <span className="text-xs font-medium">{t("calendarColor")}</span>
                <ColorPicker aria-label={t("calendarColor")} value={color} onChange={setColor} className="h-9 w-20 p-1" />
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-medium">{t("calendarVisibility")}</span>
                <select
                  className={selectClass}
                  value={visibility}
                  onChange={(event) => setVisibility(event.target.value as CalendarSource["visibility"])}
                >
                  <option value="private">{t("calendarPrivate")}</option>
                  <option value="busy">{t("calendarBusyOnly")}</option>
                  <option value="company">{t("calendarShared")}</option>
                </select>
              </label>
            </div>
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" disabled={pending} onClick={() => close(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending || !url.trim()}>
              {pending && <Loader2 className="animate-spin" />}
              {pending ? t("feeds.subscribing") : t("feeds.subscribeAction")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ImportCalendarDialog({
  open,
  onOpenChange,
  calendars,
  onImported,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Calendars the user may add events to (subscriptions excluded). */
  calendars: CalendarSource[];
  onImported: (result: { created: number; skipped: number }) => void;
  t: T;
}) {
  const [calendarId, setCalendarId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const targetId = calendars.some((calendar) => calendar.id === calendarId) ? calendarId : calendars[0]?.id ?? "";

  function close(next: boolean) {
    if (pending) return;
    if (!next) {
      setFile(null);
      setError("");
    }
    onOpenChange(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !targetId) return;
    setPending(true);
    setError("");
    try {
      const body = new FormData();
      body.set("calendarId", targetId);
      body.set("file", file);
      const response = await fetch("/api/calendar/import", { method: "POST", body });
      const result = (await response.json().catch(() => ({}))) as { error?: string; created?: number; skipped?: number };
      if (!response.ok) {
        setError(feedErrorMessage(t, result.error));
        return;
      }
      setFile(null);
      onImported({ created: result.created ?? 0, skipped: result.skipped ?? 0 });
    } catch {
      setError(feedErrorMessage(t, null));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{t("feeds.importTitle")}</DialogTitle>
            <DialogDescription>{t("feeds.importDescription")}</DialogDescription>
          </DialogHeader>
          <div className="mt-5 grid gap-4">
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              {t("feeds.importSteps")}
            </p>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium">{t("feeds.importFile")}</span>
              <Input
                required
                type="file"
                accept=".ics,.zip,text/calendar,application/zip"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium">{t("feeds.importTarget")}</span>
              <select className={selectClass} value={targetId} onChange={(event) => setCalendarId(event.target.value)}>
                {calendars.map((calendar) => (
                  <option key={calendar.id} value={calendar.id}>{calendar.name}</option>
                ))}
              </select>
            </label>
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" disabled={pending} onClick={() => close(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending || !file || !targetId}>
              {pending && <Loader2 className="animate-spin" />}
              {pending ? t("feeds.importing") : t("feeds.importAction")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
