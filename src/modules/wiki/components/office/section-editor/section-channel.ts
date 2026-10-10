/**
 * Messages between the main document tab and the section tab of "Abschnitt
 * separat bearbeiten" (same-origin BroadcastChannel per document). The section
 * content only travels over this channel: never in the URL, never on the
 * server. See docs/office-documents.md ("Editing a section separately").
 *
 * - section → main: `hello` (tab holds the lock id's Web Lock, wants the
 *   content), `who` (looking for a main tab to apply), `apply` (to one main
 *   tab), `discard`;
 * - main → section: `open` (owner answers `hello`), `here` (answers `who`),
 *   `applied`, `closed` (the main tab released the lock), `mainReady`;
 * - `ping`/`pong`: presence of open section tabs for the stale-lock check.
 */
export const sectionChannelName = (pageId: string) => `mp-section-edit:${pageId}`;

/** Web Lock name a section tab holds while it is open; the owner waits on it to notice the tab is gone. */
export const sectionTabLockName = (id: string) => `mp-section-tab:${id}`;

export type SectionMessage =
  | { type: "ping"; nonce: string }
  | { type: "pong"; nonce: string; id: string }
  | { type: "hello"; id: string }
  | { type: "open"; id: string; title: string | null; json: string }
  | { type: "who"; id: string; nonce: string }
  | { type: "here"; id: string; nonce: string; tab: string; owner: boolean }
  | { type: "apply"; id: string; tab: string; json: string }
  | { type: "applied"; id: string; ok: boolean; reason?: string }
  | { type: "discard"; id: string }
  | { type: "closed"; id: string }
  | { type: "mainReady" };

const str = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 200;

/** Validates a message from the channel; anything malformed is null. */
export function parseSectionMessage(data: unknown): SectionMessage | null {
  if (!data || typeof data !== "object") return null;
  const m = data as Record<string, unknown>;
  switch (m.type) {
    case "mainReady": return { type: "mainReady" };
    case "ping": return str(m.nonce) ? { type: "ping", nonce: m.nonce } : null;
    case "pong": return str(m.nonce) && str(m.id) ? { type: "pong", nonce: m.nonce, id: m.id } : null;
    case "hello": case "discard": case "closed":
      return str(m.id) ? { type: m.type, id: m.id } : null;
    case "open":
      if (!str(m.id) || typeof m.json !== "string" || !(m.title === null || typeof m.title === "string")) return null;
      return { type: "open", id: m.id, title: m.title, json: m.json };
    case "who": return str(m.id) && str(m.nonce) ? { type: "who", id: m.id, nonce: m.nonce } : null;
    case "here":
      if (!str(m.id) || !str(m.nonce) || !str(m.tab) || typeof m.owner !== "boolean") return null;
      return { type: "here", id: m.id, nonce: m.nonce, tab: m.tab, owner: m.owner };
    case "apply":
      return str(m.id) && str(m.tab) && typeof m.json === "string" ? { type: "apply", id: m.id, tab: m.tab, json: m.json } : null;
    case "applied":
      if (!str(m.id) || typeof m.ok !== "boolean") return null;
      return { type: "applied", id: m.id, ok: m.ok, ...(typeof m.reason === "string" ? { reason: m.reason } : {}) };
    default: return null;
  }
}

/**
 * Which main tab applies the section: the tab that opened it, otherwise the
 * first that answered (e.g. the document opened again after its tab was
 * closed). Exactly one tab applies, so the section is never inserted twice.
 */
export function pickApplyTarget(answers: ReadonlyArray<{ tab: string; owner: boolean }>): string | null {
  return (answers.find((answer) => answer.owner) ?? answers[0])?.tab ?? null;
}

/** How long the section tab waits for the main tab to send the content. */
export const HELLO_TIMEOUT_MS = 5000;
/** How long the section tab collects `here` answers before it applies. */
export const WHO_WAIT_MS = 1000;
/** No `applied` within this time: the section tab gives up and keeps the editor open. */
export const APPLY_TIMEOUT_MS = 40_000;
/** After the section tab's Web Lock is freed, the owner waits this long for a reload before it releases the lock. */
export const TAB_GONE_GRACE_MS = 10_000;

/**
 * What the owner does when the section tab's Web Lock was freed and the grace
 * time is over: keep the lock if the tab came back (reload) or the section is
 * already finished, otherwise release it (closing the tab means discarding).
 */
export function tabGoneDecision(input: { sessionId: string | null; lockId: string; reconnected: boolean }): "keep" | "release" | "ignore" {
  if (input.sessionId !== input.lockId) return "ignore";
  return input.reconnected ? "keep" : "release";
}

/** Path of the section tab for a lock (the section itself never goes into the URL). */
export function sectionTabPath(slug: string, id: string) {
  return `/wiki/pages/${encodeURIComponent(slug)}/section?edit=${encodeURIComponent(id)}`;
}
