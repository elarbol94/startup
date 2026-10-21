import { z } from "zod";

/**
 * Player and presenter windows sync over one native BroadcastChannel per presentation, so
 * a presenter tab open for a different presentation never crosses wires with this one.
 */
export function presenterChannelName(presentationId: string, sessionId?: string): string {
  return `wiki-presentation-presenter:${presentationId}${sessionId ? `:${sessionId}` : ""}`;
}

// `returns`: the stops to come back to when the open detail pages are left, innermost last
// (a PresentationPosition), so both windows walk in and out of detail pages the same way.
const returnsSchema = z.array(z.number().int().min(0)).max(50).optional();
const stepMessageSchema = z.object({ type: z.literal("step"), index: z.number().int().min(0), returns: returnsSchema });
const gotoMessageSchema = z.object({ type: z.literal("goto"), index: z.number().int().min(0), returns: returnsSchema });
// Sent by a presenter window right after it opens, so it learns the player's current step
// instead of assuming step 0 until the player happens to move.
const requestStepMessageSchema = z.object({ type: z.literal("request-step") });

export const presenterMessageSchema = z.discriminatedUnion("type", [
  stepMessageSchema,
  gotoMessageSchema,
  requestStepMessageSchema,
]);
export type PresenterMessage = z.infer<typeof presenterMessageSchema>;

/** Anything that isn't one of this feature's own messages — another channel user, a stray
 * event — is dropped rather than crashing the listener. */
export function parsePresenterMessage(data: unknown): PresenterMessage | null {
  const result = presenterMessageSchema.safeParse(data);
  return result.success ? result.data : null;
}

/** Time left of a talk's target length, as "−m:ss" once it runs over. */
export function formatRemaining(targetMs: number, elapsedMs: number): string {
  const left = targetMs - elapsedMs;
  // Rounded away from zero: "0:00" only at the target itself, "−0:01" right after it.
  return left >= 0 ? formatElapsed(left + 999) : `−${formatElapsed(-left + 999)}`;
}

/** mm:ss, growing to h:mm:ss once a talk runs past an hour. */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => value.toString().padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
