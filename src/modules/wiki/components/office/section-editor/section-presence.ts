/**
 * Presence of open section editors in this browser (all tabs), per document.
 * The main document asks before it releases a leftover section-edit lock.
 */
const channelName = (pageId: string) => `mp-section-edit:${pageId}`;

type PresenceMessage = { type?: string; nonce?: unknown; id?: unknown };

/** Lets an open section editor answer presence questions; returns the cleanup. */
export function answerSectionPings(pageId: string, id: string) {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(channelName(pageId));
  channel.onmessage = (event: MessageEvent<PresenceMessage>) => {
    if (event.data?.type === "ping") channel.postMessage({ type: "pong", nonce: event.data.nonce, id });
  };
  return () => channel.close();
}

/** Ids of the section editors open for the page in this browser. */
export function liveSectionEdits(pageId: string, waitMs = 500): Promise<Set<string>> {
  return new Promise((resolve) => {
    const ids = new Set<string>();
    if (typeof BroadcastChannel === "undefined") { resolve(ids); return; }
    const channel = new BroadcastChannel(channelName(pageId));
    const nonce = crypto.randomUUID();
    channel.onmessage = (event: MessageEvent<PresenceMessage>) => {
      if (event.data?.type === "pong" && event.data.nonce === nonce && typeof event.data.id === "string") ids.add(event.data.id);
    };
    channel.postMessage({ type: "ping", nonce });
    window.setTimeout(() => { channel.close(); resolve(ids); }, waitMs);
  });
}
