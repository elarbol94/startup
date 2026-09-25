"use client";
import * as Y from "yjs";
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { IndexeddbPersistence } from "y-indexeddb";
import { clientUUID } from "@/lib/client-uuid";
import { decode, type Kind } from "./codec";
import type { CollaborationClient, CollaborationStatus, Presence } from "./provider";
import { documentName, type SocketMessage } from "./socket-protocol";

const FLUSH_TIMEOUT_MS = 15_000;
const OFFLINE_READY_MS = 5_000;
const RECONNECT_WAIT_MS = 8_000;

type SocketConfig = { url: string; user: { id: string; name: string } };

/**
 * Live collaboration over WebSockets (Hocuspocus) with an IndexedDB copy.
 *
 * - Only changed parts travel over the socket; nothing is polled.
 * - Edits are kept in IndexedDB (per account and page), so a reload or crash
 *   while offline does not lose them; they merge when the socket reconnects.
 * - "Saved" means the server stored everything this tab shows: the server
 *   reports the state vector of each stored version and the tab compares it
 *   with its own.
 * - Save failures (e.g. an oversized paste) are reported but never lock the
 *   editor; the next successful store clears them. Only lost access does.
 */
export class SocketCollaborationProvider implements CollaborationClient {
  readonly doc = new Y.Doc();
  readonly client = clientUUID();
  status: CollaborationStatus = "connecting";
  ready = false;
  recoveryAvailable = true;
  people: Presence[] = [];
  user = { id: "", name: "" };
  errorReason: string | null = null;

  private listeners = new Set<() => void>();
  private provider?: HocuspocusProvider;
  private socket?: HocuspocusProviderWebsocket;
  private local?: IndexeddbPersistence;
  private connected = false;
  private denied = false;
  private storedVector: Map<number, number> | null = null;
  private waiters = new Map<string, (message: Extract<SocketMessage, { type: "flushed" }>) => void>();
  private stopped = true;
  private generation = 0;
  private offlineTimer?: ReturnType<typeof setTimeout>;

  constructor(private kind: Kind, private id: string) {
    this.doc.on("update", (_update: Uint8Array, origin: unknown) => {
      if (origin === this.provider || origin === this.local) return;
      this.refresh();
    });
  }

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit() { this.listeners.forEach(listener => listener()); }

  /** True while this tab shows changes the server has not stored yet. */
  private get dirty() {
    if (this.provider?.hasUnsyncedChanges) return true;
    if (!this.storedVector) return false;
    for (const [client, clock] of Y.decodeStateVector(Y.encodeStateVector(this.doc))) {
      if (clock > (this.storedVector.get(client) ?? 0)) return true;
    }
    return false;
  }

  get hasPendingChanges() { return this.dirty; }

  private refresh() {
    const previous = this.status;
    if (this.denied) this.status = "denied";
    else if (!this.ready) this.status = "connecting";
    else if (!this.connected || (typeof navigator !== "undefined" && !navigator.onLine)) this.status = "reconnecting";
    else if (this.errorReason) this.status = "error";
    else this.status = this.dirty ? "saving" : "saved";
    if (previous !== this.status || this.status === "saving") this.emit();
  }

  private presence = "";
  setPresence(presence: Pick<Presence, "cursor" | "selectedIds">) {
    const serialized = JSON.stringify(presence);
    if (serialized === this.presence) return; // avoid awareness chatter
    this.presence = serialized;
    this.provider?.awareness?.setLocalStateField("presence", presence);
  }

  private readPeople() {
    const awareness = this.provider?.awareness;
    if (!awareness) return;
    const people: Presence[] = [];
    for (const [clientId, state] of awareness.getStates()) {
      if (clientId === this.doc.clientID || !state.user?.userId) continue;
      people.push({ client: String(clientId), userId: state.user.userId, name: state.user.name ?? "", cursor: state.presence?.cursor ?? null, selectedIds: state.presence?.selectedIds });
    }
    this.people = people;
    this.emit();
  }

  private onMessage(payload: string) {
    let message: SocketMessage;
    try { message = JSON.parse(payload); } catch { return; }
    if (message.type === "stored" || message.type === "flushed") {
      if (message.vector) this.storedVector = Y.decodeStateVector(decode(message.vector));
      if (message.type === "stored" || message.ok) this.errorReason = null;
      else this.errorReason = message.reason ?? "failed";
      if (message.type === "flushed") this.waiters.get(message.nonce)?.(message);
      if (!this.dirty) this.forgetLegacyJournal();
    } else if (message.type === "store-error") {
      this.errorReason = message.reason;
      if (message.reason === "denied") this.denied = true;
    } else if (message.type === "denied") {
      this.denied = true;
    }
    this.refresh();
  }

  private onNetworkChange = () => this.refresh();

  async start() {
    this.stopped = false;
    window.addEventListener("online", this.onNetworkChange);
    window.addEventListener("offline", this.onNetworkChange);
    const generation = ++this.generation;
    let config: SocketConfig;
    try {
      const response = await fetch("/api/wiki/collaboration/socket", { cache: "no-store" });
      if (response.status === 401 || response.status === 403) { this.denied = true; this.refresh(); return; }
      if (!response.ok) throw new Error("config");
      config = await response.json();
    } catch {
      if (!this.stopped && generation === this.generation) setTimeout(() => { if (!this.stopped && generation === this.generation) void this.start(); }, 3_000);
      this.refresh();
      return;
    }
    if (this.stopped || generation !== this.generation) return;
    this.user = config.user;

    // Local copy first: offline edits from an earlier visit merge on connect.
    let hadLocalCopy = false;
    try {
      this.local = new IndexeddbPersistence(`wiki-collaboration:${this.user.id}:${documentName(this.kind, this.id)}`, this.doc);
      // Blocked or unavailable IndexedDB (private windows, full disk) only
      // disables the local copy; saving to the server continues.
      const unavailable = this.local._db.then(() => new Promise<void>(() => undefined), () => { this.recoveryAvailable = false; });
      await Promise.race([this.local.whenSynced, unavailable, new Promise(resolve => setTimeout(resolve, 2_000))]);
      hadLocalCopy = this.doc.getXmlFragment("body").length > 0;
    } catch { this.recoveryAvailable = false; }
    if (this.stopped || generation !== this.generation) return;
    this.applyLegacyJournal();

    this.socket = new HocuspocusProviderWebsocket({ url: config.url, delay: 1_000, factor: 2, maxDelay: 15_000, jitter: true });
    this.provider = new HocuspocusProvider({
      websocketProvider: this.socket,
      name: documentName(this.kind, this.id),
      document: this.doc,
      token: "session", // identity comes from the session cookie on the handshake
      onStatus: ({ status }) => { this.connected = status === "connected"; this.refresh(); },
      onSynced: () => {
        this.ready = true;
        clearTimeout(this.offlineTimer);
        this.refresh();
      },
      onUnsyncedChanges: () => this.refresh(),
      onAuthenticationFailed: () => { this.denied = true; this.refresh(); },
      onStateless: ({ payload }) => this.onMessage(payload),
      onAwarenessChange: () => this.readPeople(),
    });
    // A shared websocket provider is not attached automatically.
    this.provider.attach();
    this.provider.awareness?.setLocalStateField("user", { userId: this.user.id, name: this.user.name });
    // Offline start: show the locally kept copy instead of waiting forever.
    if (hadLocalCopy) this.offlineTimer = setTimeout(() => { if (!this.ready && !this.denied) { this.ready = true; this.refresh(); } }, OFFLINE_READY_MS);
    this.refresh();
  }

  /** Resolves true once the server has stored everything this tab shows. */
  async flush(): Promise<boolean> {
    if (this.denied || !this.provider) return false;
    if (!navigator.onLine) return !this.dirty;
    // Briefly wait for a reconnect (e.g. right after the network came back).
    if (!this.connected && !(await this.waitForConnection(RECONNECT_WAIT_MS))) return !this.dirty;
    const nonce = clientUUID();
    const reply = new Promise<Extract<SocketMessage, { type: "flushed" }> | null>(resolve => {
      const timer = setTimeout(() => { this.waiters.delete(nonce); resolve(null); }, FLUSH_TIMEOUT_MS);
      this.waiters.set(nonce, message => { clearTimeout(timer); this.waiters.delete(nonce); resolve(message); });
    });
    // Messages on one socket are handled in order, so the flush request is
    // processed after every update this tab has sent before it.
    this.provider.sendStateless(JSON.stringify({ type: "flush", nonce } satisfies SocketMessage));
    const message = await reply;
    return !!message?.ok && !this.dirty;
  }

  private waitForConnection(timeout: number) {
    return new Promise<boolean>(resolve => {
      const started = Date.now();
      const check = () => {
        if (this.connected || this.stopped || this.denied) return resolve(this.connected);
        if (Date.now() - started >= timeout) return resolve(false);
        setTimeout(check, 100);
      };
      check();
    });
  }

  stop() {
    this.stopped = true;
    window.removeEventListener("online", this.onNetworkChange);
    window.removeEventListener("offline", this.onNetworkChange);
    this.generation++;
    clearTimeout(this.offlineTimer);
    this.provider?.destroy();
    this.socket?.destroy();
    void this.local?.destroy();
    this.provider = undefined;
    this.socket = undefined;
    this.local = undefined;
    this.connected = false;
    for (const [nonce, resolve] of this.waiters) resolve({ type: "flushed", nonce, ok: false, vector: "" });
  }

  // Offline journals written by the previous HTTP transport (localStorage).
  private legacyKeys: string[] = [];
  private legacyPrefix() { return `wiki-collaboration:${this.user.id}:/api/wiki/collaboration/${this.kind}/${encodeURIComponent(this.id)}:`; }
  private applyLegacyJournal() {
    try {
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index)!;
        if (!key.startsWith(this.legacyPrefix())) continue;
        const value = localStorage.getItem(key);
        if (value) { Y.applyUpdate(this.doc, decode(value)); this.legacyKeys.push(key); }
      }
    } catch { /* storage unavailable: nothing to recover */ }
  }
  private forgetLegacyJournal() {
    try { for (const key of this.legacyKeys) localStorage.removeItem(key); } catch { /* ignore */ }
    this.legacyKeys = [];
  }
}
