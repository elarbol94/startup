import type { CollaborationStatus } from "../../collaboration/provider";

/** What the single save indicator of a wiki page shows. */
export type SaveStatusState = "connecting" | "saved" | "saving" | "unsaved" | "offline" | "error";
export type SaveStatus = { state: SaveStatusState; reason: string | null; savedAt: number | null };

/** Saving longer than this without a confirmed store means it is stuck. */
export const SAVE_STALL_MS = 20_000;

/**
 * Derives the page's save status from its collaboration transport, the only
 * place that knows what the server stored. "saved" is only possible while the
 * transport is connected, synced and has nothing unstored.
 */
export function deriveSaveStatus(input: { status: CollaborationStatus; errorReason?: string | null; savedAt?: number | null; stalled?: boolean }): SaveStatus {
  const savedAt = input.savedAt ?? null;
  switch (input.status) {
    case "saved": return { state: "saved", reason: null, savedAt };
    case "saving": return { state: input.stalled ? "unsaved" : "saving", reason: null, savedAt };
    case "reconnecting": return { state: "offline", reason: null, savedAt };
    case "connecting": return { state: "connecting", reason: null, savedAt };
    case "denied": return { state: "error", reason: "denied", savedAt };
    case "error": return { state: "error", reason: input.errorReason ?? null, savedAt };
  }
}
