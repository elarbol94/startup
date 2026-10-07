"use client";

import "@livekit/components-styles";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LiveKitRoom, VideoConference } from "@livekit/components-react";
import { ArrowLeft, CircleDot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { joinCall } from "../call-actions";

type Joined = { token: string; serverUrl: string; record: boolean };

/** A relative signaling path ("/livekit") becomes a WebSocket URL on this origin. */
function socketUrl(serverUrl: string) {
  if (/^wss?:\/\//.test(serverUrl)) return serverUrl;
  return `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}${serverUrl}`;
}

export function CallRoom({ meetingId, title, record, usesAi }: { meetingId: string; title: string; record: boolean; usesAi: boolean }) {
  const t = useTranslations("meetings");
  const router = useRouter();
  const [consentRecording, setConsentRecording] = useState(false);
  const [consentAi, setConsentAi] = useState(false);
  const [joined, setJoined] = useState<Joined | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const back = `/meetings/${meetingId}`;

  async function join() {
    setPending(true);
    setError(null);
    try {
      const result = await joinCall({ meetingId, consentRecording, consentAi });
      if (!result.ok) setError(t(`errors.${result.error}`));
      else setJoined({ token: result.token, serverUrl: socketUrl(result.serverUrl), record: result.record });
    } catch {
      setError(t("call.joinFailed"));
    } finally {
      setPending(false);
    }
  }

  if (!joined) {
    const ready = !record || (consentRecording && (!usesAi || consentAi));
    return (
      <div className="mx-auto max-w-lg space-y-4 rounded-xl border p-5">
        <Link href={back} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />{title}</Link>
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

  return (
    <div className="flex h-[calc(100dvh-7rem)] min-h-[28rem] flex-col gap-2">
      <div className="flex items-center justify-between gap-2 text-sm">
        <Link href={back} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />{title}</Link>
        {joined.record && <span className="inline-flex items-center gap-1.5 font-medium text-red-600"><CircleDot className="size-4" />{t("call.recording")}</span>}
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <LiveKitRoom
        data-lk-theme="default"
        className="min-h-0 flex-1 overflow-hidden rounded-xl"
        serverUrl={joined.serverUrl}
        token={joined.token}
        connect
        video
        audio
        options={{ adaptiveStream: true, dynacast: true }}
        onError={(cause) => setError(`${t("call.connectionFailed")} (${cause.message})`)}
        onDisconnected={() => router.push(back)}
      >
        <VideoConference />
      </LiveKitRoom>
    </div>
  );
}
