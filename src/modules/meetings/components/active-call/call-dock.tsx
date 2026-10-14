"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useParticipants, useRoomContext, useTrackToggle } from "@livekit/components-react";
import { Track } from "livekit-client";
import { Maximize2, Mic, MicOff, MonitorUp, MonitorX, PhoneOff, Users } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RecordingIndicator } from "../call-room/recording-indicator";
import { callPath, dockClass, type ActiveCall } from "./active-call-types";

/** Microphone and screen share, like the call's own control bar (which also offers this tab). */
function DockToggles() {
  const t = useTranslations("meetings");
  const mic = useTrackToggle({ source: Track.Source.Microphone });
  const screen = useTrackToggle({ source: Track.Source.ScreenShare, captureOptions: { audio: true, selfBrowserSurface: "include" } });
  return (
    <>
      <Button size="icon-sm" variant={mic.enabled ? "outline" : "destructive"} disabled={mic.pending} onClick={() => void mic.toggle()}
        aria-pressed={mic.enabled} title={mic.enabled ? t("call.dock.mute") : t("call.dock.unmute")} aria-label={mic.enabled ? t("call.dock.mute") : t("call.dock.unmute")}>
        {mic.enabled ? <Mic /> : <MicOff />}
      </Button>
      <Button size="icon-sm" variant={screen.enabled ? "default" : "outline"} disabled={screen.pending} onClick={() => void screen.toggle()}
        aria-pressed={screen.enabled} title={screen.enabled ? t("call.dock.stopShare") : t("call.dock.share")} aria-label={screen.enabled ? t("call.dock.stopShare") : t("call.dock.share")}>
        {screen.enabled ? <MonitorX /> : <MonitorUp />}
      </Button>
    </>
  );
}

/** The running call while the person works elsewhere in the platform. */
export function CallDock({ call, deviceWarning }: { call: ActiveCall; deviceWarning: boolean }) {
  const t = useTranslations("meetings");
  const room = useRoomContext();
  const participants = useParticipants();
  return (
    <section className={dockClass} aria-label={t("call.dock.label")}>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium">{call.title}</p>
        {call.joined.record && <RecordingIndicator className="shrink-0 px-2 py-0.5 text-xs" />}
      </div>
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <Users className="size-3.5" />
        {t("call.dock.participants", { count: participants.length })}
        {call.joined.roomMic && ` · ${t("call.roomMicActive")}`}
      </p>
      {deviceWarning && <p className="text-xs text-amber-700 dark:text-amber-400" role="status">{t("call.deviceFailed")}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {call.joined.canPublish && <DockToggles />}
        <Link href={callPath(call.meetingId)} className={cn(buttonVariants({ size: "sm", variant: "outline" }), "ml-auto")}><Maximize2 />{t("call.dock.open")}</Link>
        <Button size="icon-sm" variant="destructive" onClick={() => void room.disconnect()} title={t("call.dock.leave")} aria-label={t("call.dock.leave")}><PhoneOff /></Button>
      </div>
    </section>
  );
}
