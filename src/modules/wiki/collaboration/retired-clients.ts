/**
 * Every load of an editor is a new collaboration client, and the server shows a client's
 * presence for a few seconds after its last write. Without help, a reload would show the
 * author their own previous load as a collaborator.
 *
 * A client that ends (reload, navigation, unmount) records its id in this tab's
 * sessionStorage; the next load in the same tab hides those ids. Ids are never reused, so
 * a duplicated tab (which copies sessionStorage) cannot collide with a live one: a client
 * only retires itself when it stops, and un-retires itself if the page is restored.
 */
const LIMIT = 8;

type SessionStore = Pick<Storage, "getItem" | "setItem">;

function store(): SessionStore | null {
  try { return typeof sessionStorage === "undefined" ? null : sessionStorage; } catch { return null; }
}

export function retiredClientsKey(url: string) { return `wiki-collaboration-retired:${url}`; }

export function readRetiredClients(key: string, storage = store()): string[] {
  try {
    const value: unknown = JSON.parse(storage?.getItem(key) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string").slice(-LIMIT) : [];
  } catch { return []; }
}

export function setClientRetired(key: string, client: string, retired: boolean, storage = store()) {
  if (!storage) return;
  const others = readRetiredClients(key, storage).filter((id) => id !== client);
  try { storage.setItem(key, JSON.stringify(retired ? [...others, client].slice(-LIMIT) : others)); } catch { /* Storage is optional. */ }
}
