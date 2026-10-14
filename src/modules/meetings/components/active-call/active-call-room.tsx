"use client";

import "@livekit/components-styles";
import { createPortal } from "react-dom";
import { LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";
import { ConnectionError, DisconnectReason } from "livekit-client";
import { CallIdleGuard } from "../call-idle-guard";
import { CallStage } from "../call-room/call-stage";
import type { ActiveCall, EndedCall } from "./active-call-types";
import { CallDock } from "./call-dock";

type Props = {
  call: ActiveCall;
  /** The call page's stage element when that page is open; otherwise the call shows in the dock. */
  stage: HTMLElement | null;
  deviceWarning: boolean;
  onDeviceWarning: (warning: boolean) => void;
  onEnd: (key: string, result: Omit<EndedCall, "meetingId" | "title">) => void;
};

/** The connection of the tab's call, mounted by ActiveCallProvider. */
export function ActiveCallRoom({ call, stage, deviceWarning, onDeviceWarning, onEnd }: Props) {
  return (
    <LiveKitRoom
      data-lk-theme="default"
      style={{ display: "contents" }}
      serverUrl={call.joined.serverUrl}
      token={call.joined.token}
      connect
      // Viewers join without publishing rights; asking for their devices would only fail.
      // The camera starts off: people turn it on in the control bar when they want to.
      video={false}
      audio={call.joined.canPublish}
      options={{ adaptiveStream: true, dynacast: true, disconnectOnPageLeave: true }}
      // Only a failed connection ends the call. A missing or blocked camera or
      // microphone also lands here; the person stays in the call.
      onError={(cause) => cause instanceof ConnectionError
        ? onEnd(call.key, { reason: "failed", detail: cause.message })
        : onDeviceWarning(true)}
      onMediaDeviceFailure={() => onDeviceWarning(true)}
      onDisconnected={(reason?: DisconnectReason) => onEnd(call.key, {
        reason: reason === DisconnectReason.ROOM_DELETED || reason === DisconnectReason.ROOM_CLOSED ? "closed"
          : reason === DisconnectReason.CLIENT_INITIATED || reason === undefined ? "left" : "failed",
      })}
    >
      {stage ? createPortal(<CallStage record={call.joined.record} />, stage) : <CallDock call={call} deviceWarning={deviceWarning} />}
      {/* Audio and the idle check live outside the stage, so both keep working on every page. */}
      <RoomAudioRenderer />
      <CallIdleGuard onIdle={(idleReason) => onEnd(call.key, { reason: "idle", idleReason })} />
    </LiveKitRoom>
  );
}
