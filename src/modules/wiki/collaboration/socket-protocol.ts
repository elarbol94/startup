import type { Kind } from "./codec";

/** Messages exchanged as Hocuspocus stateless payloads (JSON strings). */
export type SocketMessage =
  | { type: "flush"; nonce: string }
  | { type: "flushed"; nonce: string; ok: boolean; reason?: string; vector: string }
  | { type: "stored"; vector: string }
  | { type: "store-error"; reason: string }
  | { type: "denied" };

const KINDS: Kind[] = ["page"];

export function documentName(kind: Kind, id: string) {
  return `${kind}:${id}`;
}

/** Only wiki pages are served over the socket; ids are UUID-like slugs. */
export function parseDocumentName(name: string): { kind: Kind; id: string } | null {
  const match = /^([a-z]+):([A-Za-z0-9_-]{1,200})$/.exec(name);
  if (!match || !KINDS.includes(match[1] as Kind)) return null;
  return { kind: match[1] as Kind, id: match[2] };
}
