"use client";

import "@livekit/components-styles";
import { useCallback, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LiveKitRoom } from "@livekit/components-react";
import { ConnectionError, DisconnectReason } from "livekit-client";
import { ArrowLeft, CircleDot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { joinCall } from "../call-actions";
import { CALL_SILENCE_MINUTES, CallIdleGuard } from "./call-idle-guard";
import { CallStage } from "./call-room/call-stage";
import { RecordingIndicator } from "./call-room/recording-indicator";

type Joined = { token: string; serverUrl: string; record: boolean; canPublish: boolean };
/**
 * One explicit lifecycle. Once a connection ends, the page never reconnects
 * on its own: Next.js keeps visited pages alive in the background, and an
 * auto-reconnect with an old token would loop against a closed room.
 */
type Phase =
  | { kind: "prejoin" }
  | { kind: "call"; joined: Joined; attempt: number }
  | { kind: "ended"; reason: "left" | "closed" | "failed" | "idle"; detail?: string };

/** A relative signaling path ("/livekit") becomes a WebSocket URL on this origin. */
function socketUrl(serverUrl: string) {
  if (/^wss?:\/\//.test(serverUrl)) return serverUrl;
  return `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}${serverUrl}`;
}

export function CallRoom({ meetingId, title, record, usesAi }: { meetingId: string; title: string; record: boolean; usesAi: boolean }) {
  const t = useTranslations("meetings");
  const [consentRecording, setConsentRecording] = useState(false);
  const [consentAi, setConsentAi] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "prejoin" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [deviceWarning, setDeviceWarning] = useState(false);
  const back = `/meetings/${meetingId}`;

  async function join() {
    setPending(true);
    setError(null);
    setDeviceWarning(false);
    try {
      // Always a fresh token: they are short-lived and bound to one call.
      const result = await joinCall({ meetingId, consentRecording, consentAi });
      if (!result.ok) setError(t(`errors.${result.error}`));
      else setPhase((current) => ({
        kind: "call",
        joined: { token: result.token, serverUrl: socketUrl(result.serverUrl), record: result.record, canPublish: result.canPublish },
        attempt: current.kind === "call" ? current.attempt + 1 : 0,
      }));
    } catch {
      setError(t("call.joinFailed"));
    } finally {
      setPending(false);
    }
  }

  function disconnected(reason?: DisconnectReason) {
    setPhase((current) => current.kind !== "call" ? current : {
      kind: "ended",
      reason: reason === DisconnectReason.ROOM_DELETED || reason === DisconnectReason.ROOM_CLOSED ? "closed"
        : reason === DisconnectReason.CLIENT_INITIATED || reason === undefined ? "left" : "failed",
    });
  }

  // Unmounting the room disconnects it; the "left" from that disconnect is ignored.
  const leaveIdle = useCallback(() => setPhase({ kind: "ended", reason: "idle" }), []);

  const header = (
    <div className="flex items-center justify-between gap-2 text-sm">
      <Link href={back} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />{title}</Link>
      {phase.kind === "call" && phase.joined.record && <RecordingIndicator />}
    </div>
  );

  if (phase.kind === "call") {
    return (
      <div className="flex h-[calc(100dvh-8rem)] min-h-[28rem] flex-col gap-2">
        {header}
        {deviceWarning && <p className="text-sm text-amber-700 dark:text-amber-400" role="status">{t("call.deviceFailed")}</p>}
        <LiveKitRoom
          key={phase.attempt}
          data-lk-theme="default"
          className="relative min-h-0 flex-1 overflow-hidden rounded-xl"
          serverUrl={phase.joined.serverUrl}
          token={phase.joined.token}
          connect
          // Viewers join without publishing rights; asking for their devices would only fail.
          // The camera starts off: people turn it on in the control bar when they want to.
          video={false}
          audio={phase.joined.canPublish}
          options={{ adaptiveStream: true, dynacast: true, disconnectOnPageLeave: true }}
          // Only a failed connection ends the call. A missing or blocked camera or
          // microphone also lands here; the person stays in the call.
          onError={(cause) => cause instanceof ConnectionError
            ? setPhase({ kind: "ended", reason: "failed", detail: cause.message })
            : setDeviceWarning(true)}
          onMediaDeviceFailure={() => setDeviceWarning(true)}
          onDisconnected={disconnected}
        >
          <CallStage record={phase.joined.record} />
          <CallIdleGuard onIdle={leaveIdle} />
        </LiveKitRoom>
      </div>
    );
  }

  if (phase.kind === "ended") {
    const message = phase.reason === "closed" ? t("call.closed") : phase.reason === "failed" ? t("call.connectionFailed")
      : phase.reason === "idle" ? t("call.idleLeft", { minutes: CALL_SILENCE_MINUTES }) : t("call.left");
    return (
      <div className="mx-auto max-w-lg space-y-4 rounded-xl border p-5">
        {header}
        <p className="text-sm">{message}</p>
        {phase.detail && <p className="text-xs text-muted-foreground">{phase.detail}</p>}
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <div className="flex flex-wrap gap-2">
          {phase.reason !== "closed" && <Button disabled={pending} onClick={() => void join()}>{t("call.rejoin")}</Button>}
          <Link href={back} className="inline-flex h-8 items-center rounded-lg border px-3 text-sm hover:bg-muted">{t("call.backToMeeting")}</Link>
        </div>
      </div>
    );
  }

  const ready = !record || (consentRecording && (!usesAi || consentAi));
  return (
    <div className="mx-auto max-w-lg space-y-4 rounded-xl border p-5">
      {header}
      <h2 className="text-lg font-semibold">{t("call.joinTitle")}</h2>
      <p className="text-sm text-muted-foreground">{t("call.tailscaleHint")}</p>
      {record && (
        <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p className="flex items-center gap-2 font-medium"><CircleDot className="size-4 text-red-600" />{t("call.recordedNotice")}</p>
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
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <Button disabled={!ready || pending} onClick={() => void join()}>{t("call.joinButton")}</Button>
    </div>
  );
}
