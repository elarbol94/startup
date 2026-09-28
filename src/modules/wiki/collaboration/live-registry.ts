import type { Kind } from "./codec";

/**
 * Bridge between server-side room writes (history restore, version-control
 * restore) and the in-memory documents held by the live WebSocket server.
 *
 * The socket server runs in the same Node.js process (started from
 * instrumentation) but in a different module graph, so the hand-off goes
 * through a process-wide registration instead of a direct import.
 */
type LiveBridge = {
  apply(kind: Kind, id: string, state: Uint8Array): void;
  /** Disconnects everyone from a live document and returns its in-memory state (null when not open). */
  freeze(kind: Kind, id: string): Uint8Array | null;
};
const registry = globalThis as typeof globalThis & { __wikiLiveCollaboration?: LiveBridge };

export function registerLiveBridge(bridge: LiveBridge) {
  registry.__wikiLiveCollaboration = bridge;
}

/** Merges a committed room state into the live document, if one is open. */
export function pushToLiveDocument(kind: Kind, id: string, state: Uint8Array) {
  try { registry.__wikiLiveCollaboration?.apply(kind, id, state); }
  catch (error) { console.warn(JSON.stringify({ event: "live_collaboration_push_failed", kind, reason: error instanceof Error ? error.message : "unknown" })); }
}

/**
 * Ends live editing of a document (office conversion) and hands back what was
 * still only in memory, so it can be committed before the body moves on.
 */
export function freezeLiveDocument(kind: Kind, id: string) {
  return registry.__wikiLiveCollaboration?.freeze(kind, id) ?? null;
}
