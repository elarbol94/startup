"use client";
import * as Y from "yjs";
import { decode, encode, REMOTE, type Kind } from "./codec";

export type Presence = { client: string; name: string; userId: string; cursor?: { anchor: string; head: string } | null; selectedIds?: string[] };
export type CollaborationStatus = "connecting" | "saving" | "saved" | "reconnecting" | "denied" | "error";
export class CollaborationProvider {
  readonly doc = new Y.Doc();
  readonly client = globalThis.crypto.randomUUID();
  status: CollaborationStatus = "connecting";
  ready = false;
  recoveryAvailable = true;
  people: Presence[] = [];
  user = { id: "", name: "" };
  private listeners = new Set<() => void>();
  private pending: Uint8Array[] = [];
  private key = "";
  private recovered = new Map<string, string>();
  private source?: EventSource;
  private retry?: ReturnType<typeof setInterval>;
  private presenceTimer?: ReturnType<typeof setTimeout>;
  private inFlight?: Promise<boolean>;
  private disposed = true;
  private generation = 0;
  private presence: Pick<Presence, "cursor" | "selectedIds"> = {};
  private sequence = 0;
  readonly url: string;
  constructor(kind: Kind, id: string) {
    this.url = `/api/wiki/collaboration/${kind}/${encodeURIComponent(id)}`;
    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === REMOTE) return;
      this.pending.push(update);
      this.journal();
      if (this.status === "denied" || this.status === "error") return;
      this.setStatus("saving");
      if (this.ready && !this.disposed) void this.flush();
    });
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit() { this.listeners.forEach(listener => listener()); }
  private setStatus(status: CollaborationStatus) {
    if ((this.status === "denied" || this.status === "error") && status !== this.status) return;
    this.status = status; this.emit();
  }
  private journal() {
    if (!this.key || !this.ready) return;
    try {
      if (this.pending.length) localStorage.setItem(this.key, encode(Y.encodeStateAsUpdate(this.doc)));
      else {
        localStorage.removeItem(this.key);
        for (const [key, value] of this.recovered) if (localStorage.getItem(key) === value) localStorage.removeItem(key);
        this.recovered.clear();
      }
    } catch { this.recoveryAvailable = false; this.emit(); }
  }
  setPresence(presence: Pick<Presence, "cursor" | "selectedIds">) {
    if (JSON.stringify(presence) === JSON.stringify(this.presence)) return;
    this.presence = presence;
    if (!this.presenceTimer) this.presenceTimer = setTimeout(() => {
      this.presenceTimer = undefined;
      if (this.ready && !this.disposed) void this.flush();
    }, 250);
  }
  async start() {
    this.disposed = false;
    const generation = ++this.generation;
    const connect = async () => {
      try {
        const response = await fetch(this.url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
        if (this.disposed || generation !== this.generation) return;
        if (!response.ok) { this.setStatus(response.status === 401 || response.status === 403 ? "denied" : "reconnecting"); return; }
        const data = await response.json();
        if (this.disposed || generation !== this.generation) return;
        this.user = data.user;
        const prefix = `wiki-collaboration:${this.user.id}:${this.url}:`;
        this.key = `${prefix}${this.client}`;
        Y.applyUpdate(this.doc, decode(data.update), REMOTE);
        if (!this.ready) {
          const serverVector = Y.encodeStateVector(this.doc);
          try {
            for (let index = 0; index < localStorage.length; index++) {
              const key = localStorage.key(index)!;
              if (!key.startsWith(prefix)) continue;
              const recovered = localStorage.getItem(key);
              if (recovered) { const update = decode(recovered); Y.applyUpdate(this.doc, update, REMOTE); this.recovered.set(key, recovered); }
            }
          } catch { this.recoveryAvailable = false; }
          if (this.recovered.size) this.pending.push(Y.encodeStateAsUpdate(this.doc, serverVector));
        }
        this.sequence = data.sequence;
        this.ready = true;
        this.setStatus(this.pending.length ? "saving" : "saved");
        this.source?.close();
        this.source = new EventSource(`${this.url}?stream=1&after=${this.sequence}`);
        this.source.addEventListener("update", event => {
          try { const data = JSON.parse((event as MessageEvent).data); Y.applyUpdate(this.doc, decode(data.update), REMOTE); this.sequence = data.sequence; this.journal(); }
          catch { this.setStatus("error"); }
        });
        this.source.addEventListener("presence", event => { this.people = JSON.parse((event as MessageEvent).data).filter((person: Presence) => person.client !== this.client); this.emit(); });
        this.source.addEventListener("denied", () => { this.source?.close(); this.setStatus("denied"); });
        this.source.onerror = () => { if (this.status !== "denied" && this.status !== "error") this.setStatus("reconnecting"); };
        this.source.onopen = () => { if (this.status !== "denied" && this.status !== "error") this.setStatus(this.pending.length ? "saving" : "saved"); };
        await this.flush();
      } catch { if (!this.disposed) this.setStatus("reconnecting"); }
    };
    await connect();
    if (!this.disposed && generation === this.generation) this.retry = setInterval(() => {
      if (this.status === "denied" || this.status === "error") return;
      if (!this.ready) void connect(); else void this.flush();
    }, 3000);
  }
  flush(): Promise<boolean> {
    if (this.inFlight) return this.inFlight.then(ok => ok && this.pending.length ? this.flush() : ok);
    if (!this.ready || this.status === "denied" || this.status === "error") return Promise.resolve(false);
    const count = this.pending.length;
    const update = count ? encode(Y.mergeUpdates(this.pending.slice(0, count))) : undefined;
    this.inFlight = (async () => {
      try {
        if (count) this.setStatus("saving");
        const response = await fetch(this.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client: this.client, update, presence: this.presence }), signal: AbortSignal.timeout(15_000) });
        if (!response.ok) { this.setStatus(response.status === 401 || response.status === 403 ? "denied" : response.status === 400 || response.status === 413 ? "error" : "reconnecting"); return false; }
        const data = await response.json();
        Y.applyUpdate(this.doc, decode(data.update), REMOTE);
        this.pending.splice(0, count);
        this.journal();
        this.setStatus(this.pending.length ? "saving" : "saved");
        return true;
      } catch { this.setStatus("reconnecting"); return false; }
      finally { this.inFlight = undefined; }
    })();
    return this.inFlight.then(ok => ok && this.pending.length ? this.flush() : ok);
  }
  stop() { this.disposed = true; this.generation++; this.source?.close(); clearInterval(this.retry); clearTimeout(this.presenceTimer); this.presenceTimer = undefined; this.journal(); }
}
