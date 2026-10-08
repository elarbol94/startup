"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRoomContext } from "@livekit/components-react";
import { RoomEvent } from "livekit-client";
import { Button } from "@/components/ui/button";
import { CALL_CHECK_HOURS, CALL_SILENCE_MINUTES, idlePrompt, type IdleReason } from "./call-idle-utils";

export { CALL_CHECK_HOURS, CALL_SILENCE_MINUTES, type IdleReason } from "./call-idle-utils";

const CHECK_MS = 1_000;

/**
 * Leaves a call after asking first: when nobody has spoken for a while, and
 * every few hours regardless (music in the background counts as speech). A
 * tab left open in the background would otherwise keep the call (and its
 * recording) running for hours. Times are compared as timestamps because
 * browsers slow down timers in background tabs.
 */
export function CallIdleGuard({ onIdle }: { onIdle: (reason: IdleReason) => void }) {
  const t = useTranslations("meetings");
  const room = useRoomContext();
  const [lastActivity, setLastActivity] = useState(() => Date.now());
  const [lastConfirmed, setLastConfirmed] = useState(() => Date.now());
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

  const prompt = idlePrompt(now, lastActivity, lastConfirmed);
  const reason = prompt?.reason;
  const expired = prompt?.remainingMs === 0;

  useEffect(() => {
    if (reason && expired) onIdle(reason);
  }, [reason, expired, onIdle]);

  if (!prompt) return null;
  const seconds = Math.ceil(prompt.remainingMs / 1000);
  return (
    <div role="alertdialog" aria-labelledby="call-idle-title" className="absolute inset-x-0 top-3 z-50 mx-auto w-[min(28rem,calc(100%-2rem))] space-y-3 rounded-xl border bg-background p-4 text-foreground shadow-lg">
      <p id="call-idle-title" className="font-medium">{t("call.idleTitle")}</p>
      <p className="text-sm text-muted-foreground">
        {prompt.reason === "silence"
          ? t("call.idlePrompt", { minutes: CALL_SILENCE_MINUTES, seconds })
          : t("call.durationPrompt", { hours: CALL_CHECK_HOURS, seconds })}
      </p>
      <Button size="sm" onClick={() => {
        const current = Date.now();
        setLastActivity(current);
        setLastConfirmed(current);
        setNow(current);
      }}>{t("call.idleStay")}</Button>
    </div>
  );
}
