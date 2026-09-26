// The presentation editor's header save indicator, derived from one source. Used by
// components/presentation-editor/use-presentation-save-state.ts.
import type { CollaborationStatus } from "../collaboration/provider";

export type PresentationSaveState = "idle" | "unsaved" | "saving" | "saved" | "error" | "offline";

export type PresentationSaveInput = {
  /** The collaboration transport, when the editor writes through one (every editor does). */
  collaboration: { status: CollaborationStatus; hasPendingChanges: boolean } | null;
  /** navigator.onLine */
  online: boolean;
  /** Without collaboration: the editor's own write bookkeeping. */
  local: Exclude<PresentationSaveState, "unsaved" | "offline">;
  dirty: boolean;
  failed: boolean;
};

/**
 * With collaboration the canvas's own dirty flag is meaningless -- every edit already went
 * into the shared document -- so only the transport's pending/in-flight state counts.
 * Changes that cannot leave the tab right now are either held for later (offline or a
 * transport that is reconnecting) or refused (denied, or a write the server rejected).
 */
export function presentationSaveState({ collaboration, online, local, dirty, failed }: PresentationSaveInput): PresentationSaveState {
  if (!collaboration) return local === "saving" ? "saving" : failed ? "error" : dirty ? "unsaved" : local;
  const { status, hasPendingChanges } = collaboration;
  if (status === "denied" || status === "error") return hasPendingChanges ? "error" : "saved";
  if (status === "connecting") return "idle";
  if (!hasPendingChanges) return "saved";
  if (!online || status === "reconnecting") return "offline";
  return "saving";
}
