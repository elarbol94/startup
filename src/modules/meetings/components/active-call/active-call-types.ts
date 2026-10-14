import type { IdleReason } from "../call-idle-utils";

export type JoinedCall = { token: string; serverUrl: string; record: boolean; canPublish: boolean; roomMic: boolean };
export type ActiveCall = { key: string; meetingId: string; title: string; joined: JoinedCall };
export type EndedCall = {
  meetingId: string;
  title: string;
  reason: "left" | "closed" | "failed" | "idle";
  detail?: string;
  idleReason?: IdleReason;
};

export const callPath = (meetingId: string) => `/meetings/${meetingId}/call`;

/** The corner card for the call while the person is elsewhere in the platform. */
export const dockClass = "fixed right-4 bottom-4 left-4 z-50 space-y-2 rounded-xl border bg-card p-3 text-card-foreground shadow-lg sm:left-auto sm:w-80";
