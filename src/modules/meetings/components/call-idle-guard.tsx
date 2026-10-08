"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRoomContext } from "@livekit/components-react";
import { RoomEvent } from "livekit-client";
import { Button } from "@/components/ui/button";

export const CALL_SILENCE_MINUTES = 15;
const SILENCE_MS = CALL_SILENCE_MINUTES * 60_000;
const GRACE_MS = 60_000;
const CHECK_MS = 1_000;

/**
 * Leaves a call nobody has spoken in for a while, after asking first. A tab
 * left open in the background would otherwise keep the call (and its
 * recording) running for hours. Times are compared as timestamps because
 * browsers slow down timers in background tabs.
 */
export function CallIdleGuard({ onIdle }: { onIdle: () => void }) {
  const t = useTranslations("meetings");
  const room = useRoomContext();
  const [lastActivity, setLastActivity] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const touch = () => setLastActivity(Date.now());
    const onSpeakers = () => { if (room.activeSpeakers.length) touch(); };
    room.on(RoomEvent.ActiveSpeakersChanged, onSpeakers);
    // Someone talking without pause produces no new speaker event, so poll as well.
    const timer = setInterval(() => {
      if (room.activeSpeakers.length) touch();
      setNow(Date.now());
    }, CHECK_MS);
    return () => {
      room.off(RoomEvent.ActiveSpeakersChanged, onSpeakers);
      clearInterval(timer);
    };
  }, [room]);

  const silentFor = now - lastActivity;
  const asking = silentFor >= SILENCE_MS;
  const remaining = Math.max(0, SILENCE_MS + GRACE_MS - silentFor);

  useEffect(() => {
    if (asking && remaining === 0) onIdle();
  }, [asking, remaining, onIdle]);

  if (!asking) return null;
  return (
    <div role="alertdialog" aria-labelledby="call-idle-title" className="absolute inset-x-0 top-3 z-50 mx-auto w-[min(28rem,calc(100%-2rem))] space-y-3 rounded-xl border bg-background p-4 text-foreground shadow-lg">
      <p id="call-idle-title" className="font-medium">{t("call.idleTitle")}</p>
      <p className="text-sm text-muted-foreground">{t("call.idlePrompt", { minutes: CALL_SILENCE_MINUTES, seconds: Math.ceil(remaining / 1000) })}</p>
      <Button size="sm" onClick={() => { setLastActivity(Date.now()); setNow(Date.now()); }}>{t("call.idleStay")}</Button>
    </div>
  );
}
