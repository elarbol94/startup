"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft, CircleDot, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { joinCall } from "../call-actions";
import { useActiveCall } from "./active-call/active-call-provider";
import { CALL_CHECK_HOURS, CALL_SILENCE_MINUTES } from "./call-idle-utils";
import { RecordingIndicator } from "./call-room/recording-indicator";

/** A relative signaling path ("/livekit") becomes a WebSocket URL on this origin. */
function socketUrl(serverUrl: string) {
  if (/^wss?:\/\//.test(serverUrl)) return serverUrl;
  return `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}${serverUrl}`;
}

/**
 * The call page: joining, the full call view, or how it ended. The connection
 * itself belongs to ActiveCallProvider, so leaving this page for another one
 * in the platform keeps the call running in a dock.
 */
export function CallRoom({ meetingId, title, record, usesAi }: { meetingId: string; title: string; record: boolean; usesAi: boolean }) {
  const t = useTranslations("meetings");
  const { call, ended, deviceWarning, enter, setStage } = useActiveCall();
  const [consentRecording, setConsentRecording] = useState(false);
  const [consentAi, setConsentAi] = useState(false);
  const [roomMic, setRoomMic] = useState(false);
  const [consentRoom, setConsentRoom] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const back = `/meetings/${meetingId}`;
  const inThisCall = call?.meetingId === meetingId ? call : null;
  const endedHere = !call && ended?.meetingId === meetingId ? ended : null;

  async function join() {
    setPending(true);
    setError(null);
    try {
      // Always a fresh token: they are short-lived and bound to one call.
      const result = await joinCall({ meetingId, consentRecording, consentAi, roomMic, consentRoom });
      if (!result.ok) setError(t(`errors.${result.error}`));
      else enter(meetingId, title, {
        token: result.token, serverUrl: socketUrl(result.serverUrl), record: result.record, canPublish: result.canPublish, roomMic: result.roomMic,
      });
    } catch {
      setError(t("call.joinFailed"));
    } finally {
      setPending(false);
    }
  }

  const header = (
    <div className="flex items-center justify-between gap-2 text-sm">
      <Link href={back} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />{title}</Link>
      <div className="flex items-center gap-3">
        {inThisCall?.joined.roomMic && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Users className="size-3.5" />{t("call.roomMicActive")}</span>}
        {inThisCall?.joined.record && <RecordingIndicator />}
      </div>
    </div>
  );

  if (inThisCall) {
    return (
      <div className="flex h-[calc(100dvh-8rem)] min-h-[28rem] flex-col gap-2">
        {header}
        {deviceWarning && <p className="text-sm text-amber-700 dark:text-amber-400" role="status">{t("call.deviceFailed")}</p>}
        <p className="text-xs text-muted-foreground">{t("call.keepsRunning")}</p>
        {/* ActiveCallProvider renders the call into this element. */}
        <div ref={setStage} data-lk-theme="default" className="lk-room-container relative min-h-0 flex-1 overflow-hidden rounded-xl" />
      </div>
    );
  }

  if (endedHere) {
    const message = endedHere.reason === "closed" ? t("call.closed") : endedHere.reason === "failed" ? t("call.connectionFailed")
      : endedHere.reason === "idle" ? (endedHere.idleReason === "duration" ? t("call.durationLeft", { hours: CALL_CHECK_HOURS }) : t("call.idleLeft", { minutes: CALL_SILENCE_MINUTES }))
        : t("call.left");
    return (
      <div className="mx-auto max-w-lg space-y-4 rounded-xl border bg-card p-5 shadow-card">
        {header}
        <p className="text-sm">{message}</p>
        {endedHere.detail && <p className="text-xs text-muted-foreground">{endedHere.detail}</p>}
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <div className="flex flex-wrap gap-2">
          {endedHere.reason !== "closed" && <Button disabled={pending} onClick={() => void join()}>{t("call.rejoin")}</Button>}
          <Link href={back} className="inline-flex h-8 items-center rounded-lg border px-3 text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">{t("call.backToMeeting")}</Link>
        </div>
      </div>
    );
  }

  const ready = !record || (consentRecording && (!usesAi || consentAi) && (!roomMic || consentRoom));
  return (
    <div className="mx-auto max-w-lg space-y-4 rounded-xl border bg-card p-5 shadow-card">
      {header}
      <h2 className="text-lg font-semibold">{t("call.joinTitle")}</h2>
      <p className="text-sm text-muted-foreground">{t("call.tailscaleHint")}</p>
      {call && <p className="text-sm text-amber-700 dark:text-amber-400" role="status">{t("call.otherCall", { title: call.title })}</p>}
      {record && (
        <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p className="flex items-center gap-2 font-medium"><CircleDot className="size-4 text-destructive" />{t("call.recordedNotice")}</p>
          <label className="flex items-start gap-2">
            <Checkbox className="mt-0.5" checked={consentRecording} onCheckedChange={(checked) => setConsentRecording(checked === true)} />
            <span>{t("call.consentRecording")}</span>
          </label>
          {usesAi && (
            <label className="flex items-start gap-2">
              <Checkbox className="mt-0.5" checked={consentAi} onCheckedChange={(checked) => setConsentAi(checked === true)} />
              <span>{t("call.consentAi")}</span>
            </label>
          )}
          <p className="text-xs text-muted-foreground">{t("call.noConsentHint")}</p>
        </div>
      )}
      {record && (
        <div className="space-y-3 rounded-lg border p-3 text-sm">
          <label className="flex items-start gap-2">
            <Checkbox className="mt-0.5" checked={roomMic} onCheckedChange={(checked) => setRoomMic(checked === true)} />
            <span>
              <span className="font-medium">{t("call.roomMic")}</span>
              <span className="block text-xs text-muted-foreground">{t("call.roomMicHint")}</span>
            </span>
          </label>
          {roomMic && (
            <label className="flex items-start gap-2">
              <Checkbox className="mt-0.5" checked={consentRoom} onCheckedChange={(checked) => setConsentRoom(checked === true)} />
              <span>{usesAi ? t("call.consentRoomAi") : t("call.consentRoom")}</span>
            </label>
          )}
        </div>
      )}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <Button disabled={!ready || pending} onClick={() => void join()}>{t("call.joinButton")}</Button>
    </div>
  );
}
