// When the call page asks "Still there?". Pure, so it is unit-tested directly.

export const CALL_SILENCE_MINUTES = 15;
/** Asked regardless of speech: background music counts as speech for LiveKit. */
export const CALL_CHECK_HOURS = 3;
export const IDLE_GRACE_MS = 60_000;
const SILENCE_MS = CALL_SILENCE_MINUTES * 60_000;
const CHECK_MS = CALL_CHECK_HOURS * 60 * 60_000;

export type IdleReason = "silence" | "duration";

/**
 * `lastActivity` is the last time anyone spoke, `lastConfirmed` when this
 * person joined or last answered the prompt. When both conditions hold, the
 * one whose deadline comes first is shown.
 */
export function idlePrompt(now: number, lastActivity: number, lastConfirmed: number): { reason: IdleReason; remainingMs: number } | null {
  const candidates: Array<{ reason: IdleReason; deadline: number }> = [];
  if (now - lastActivity >= SILENCE_MS) candidates.push({ reason: "silence", deadline: lastActivity + SILENCE_MS + IDLE_GRACE_MS });
  if (now - lastConfirmed >= CHECK_MS) candidates.push({ reason: "duration", deadline: lastConfirmed + CHECK_MS + IDLE_GRACE_MS });
  const first = candidates.sort((a, b) => a.deadline - b.deadline)[0];
  return first ? { reason: first.reason, remainingMs: Math.max(0, first.deadline - now) } : null;
}
