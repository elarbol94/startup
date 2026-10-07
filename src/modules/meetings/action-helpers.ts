import "server-only";

import { revalidatePath } from "next/cache";

export type MeetingActionError =
  | "invalid"
  | "notFound"
  | "forbidden"
  | "lastHost"
  | "declaration"
  | "busy"
  | "stale"
  | "notApproved"
  | "unknownItem"
  | "aiDisabled";
export type MeetingActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: MeetingActionError };

export const fail = (error: MeetingActionError) => ({ ok: false as const, error });

export function revalidateMeeting(meetingId?: string) {
  revalidatePath("/meetings");
  if (meetingId) revalidatePath(`/meetings/${meetingId}`);
}
