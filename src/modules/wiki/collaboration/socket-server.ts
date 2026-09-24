import "server-only";
import * as Y from "yjs";
import { Server, type Document } from "@hocuspocus/server";
import { getSessionFromHeaders } from "@/lib/auth";
import { authorize, DATABASE_ORIGIN, loadRoom, storeLiveDocument, type Viewer } from "./store";
import { registerLiveBridge } from "./live-registry";
import { documentName, parseDocumentName, type SocketMessage } from "./socket-protocol";

/**
 * Live collaboration over WebSockets (Hocuspocus) for wiki pages.
 *
 * Runs inside the Next.js server process, started from instrumentation, on its
 * own port (COLLAB_PORT, default 3001). Documents are kept in memory while
 * people are connected and persisted through the existing room store:
 * debounced while typing, immediately on request (export, navigation) and when
 * the last person leaves. Presentations keep using the HTTP transport.
 */
type Context = { viewer: Viewer; sessionId: string; checkedAt: number };
type StoreState = { error: string | null; storedAt: number; vector: string };

const STORE_DEBOUNCE_MS = 2_000;
const STORE_MAX_DEBOUNCE_MS = 10_000;
const REAUTHORIZE_INTERVAL_MS = 1_000;
const MAX_MESSAGE_BYTES = 8_500_000;

const holder = globalThis as typeof globalThis & { __wikiSocketServer?: Promise<Server<Context>> };

function allowedOrigins() {
  const origins = new Set<string>();
  for (const value of [process.env.BETTER_AUTH_URL, ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "").split(",")]) {
    try { if (value?.trim()) origins.add(new URL(value.trim()).origin); } catch { /* ignore malformed entries */ }
  }
  return origins;
}

function storeErrorReason(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/too large/i.test(message)) return "tooLarge";
  if (/access|unavailable/i.test(message)) return "denied";
  if (/invalid|schema|parse/i.test(message)) return "invalid";
  return "failed";
}

function send(target: { sendStateless(payload: string): void }, message: SocketMessage) {
  target.sendStateless(JSON.stringify(message));
}
function broadcast(document: Document, message: SocketMessage) {
  document.broadcastStateless(JSON.stringify(message));
}
function storedVector(document: Document) {
  return Buffer.from(Y.encodeStateVector(document)).toString("base64");
}

export function startCollaborationSocketServer() {
  if (holder.__wikiSocketServer) return holder.__wikiSocketServer;
  const port = Number(process.env.COLLAB_PORT ?? 3001);
  const address = process.env.COLLAB_HOST ?? process.env.HOSTNAME ?? "0.0.0.0";
  const origins = allowedOrigins();
  const stores = new Map<string, StoreState>();

  const server = new Server<Context>({
    name: "wiki-collaboration",
    port,
    address,
    quiet: true,
    stopOnSignals: false,
    debounce: STORE_DEBOUNCE_MS,
    maxDebounce: STORE_MAX_DEBOUNCE_MS,
    unloadImmediately: false,
    websocketOptions: { maxPayload: MAX_MESSAGE_BYTES },

    async onConnect({ requestHeaders, documentName: name }) {
      // Browsers always send Origin on WebSocket handshakes; rejecting foreign
      // origins prevents another site from using a signed-in user's cookies.
      const origin = requestHeaders.get("origin");
      if (!origin || !origins.has(origin)) throw new Error("Forbidden origin");
      if (!parseDocumentName(name)) throw new Error("Unknown document");
    },

    async onAuthenticate({ requestHeaders, documentName: name }) {
      const target = parseDocumentName(name);
      if (!target) throw new Error("Unknown document");
      const login = await getSessionFromHeaders(requestHeaders);
      if (!login) throw new Error("Unauthorized");
      const viewer: Viewer = { id: login.user.id, name: login.user.name, role: login.user.role };
      authorize(target.kind, target.id, viewer, login.session.id);
      return { viewer, sessionId: login.session.id, checkedAt: Date.now() } satisfies Context;
    },

    // Identity shown to collaborators always comes from the session.
    async beforeHandleAwareness({ context, states }) {
      if (!context) return;
      for (const state of states.values()) state.user = { userId: context.viewer.id, name: context.viewer.name ?? "" };
    },

    async onLoadDocument({ document, documentName: name }) {
      const target = parseDocumentName(name)!;
      const room = loadRoom(target.kind, target.id);
      Y.applyUpdate(document, room.state, DATABASE_ORIGIN);
      stores.set(name, { error: null, storedAt: Date.now(), vector: storedVector(document) });
    },

    // Tell each new tab what is already stored, so it can show "saved" exactly.
    async connected({ connection, documentName: name }) {
      const state = stores.get(name);
      if (state) send(connection, state.error ? { type: "store-error", reason: state.error } : { type: "stored", vector: state.vector });
    },

    async onStoreDocument({ document, documentName: name, lastContext }) {
      const target = parseDocumentName(name)!;
      const viewer = lastContext?.viewer;
      if (!viewer) return; // nothing was edited through a client connection
      try {
        storeLiveDocument(target.kind, target.id, document, viewer);
        const vector = storedVector(document);
        stores.set(name, { error: null, storedAt: Date.now(), vector });
        broadcast(document, { type: "stored", vector });
      } catch (error) {
        const reason = storeErrorReason(error);
        const previous = stores.get(name);
        stores.set(name, { error: reason, storedAt: previous?.storedAt ?? 0, vector: previous?.vector ?? "" });
        console.warn(JSON.stringify({ event: "live_collaboration_store_failed", reason, message: error instanceof Error ? error.message : "unknown" }));
        // The document stays in memory; people keep editing and the next
        // successful store (e.g. after undoing an oversized paste) clears this.
        broadcast(document, { type: "store-error", reason });
        if (reason === "denied") server.hocuspocus.closeConnections(name);
      }
    },

    async afterUnloadDocument({ documentName: name }) {
      stores.delete(name);
    },

    async onStateless({ connection, document, documentName: name, payload }) {
      let message: SocketMessage;
      try { message = JSON.parse(payload); } catch { return; }
      if (message.type !== "flush") return;
      await server.hocuspocus.storeDocumentHooks(document, {
        clientsCount: document.getConnectionsCount(),
        document,
        documentName: name,
        instance: server.hocuspocus,
        lastContext: connection.context,
        lastTransactionOrigin: undefined,
      }, true);
      const state = stores.get(name);
      send(connection, { type: "flushed", nonce: message.nonce, ok: !state?.error, reason: state?.error ?? undefined, vector: state?.vector ?? "" });
    },
  });

  // Sessions can expire and pages can be deleted while people are connected.
  const sweep = setInterval(() => {
    for (const [name, document] of server.hocuspocus.documents) {
      const target = parseDocumentName(name);
      if (!target) continue;
      for (const connection of document.getConnections()) {
        const context = connection.context as Context | undefined;
        if (!context?.viewer) continue;
        try { authorize(target.kind, target.id, context.viewer, context.sessionId); context.checkedAt = Date.now(); }
        catch {
          send(connection, { type: "denied" });
          connection.close({ code: 4403, reason: "Access ended" });
        }
      }
    }
  }, REAUTHORIZE_INTERVAL_MS);
  sweep.unref?.();

  registerLiveBridge({
    apply(kind, id, state) {
      const document = server.hocuspocus.documents.get(documentName(kind, id));
      if (document) Y.applyUpdate(document, state, DATABASE_ORIGIN);
    },
  });

  holder.__wikiSocketServer = server.listen().then(() => {
    console.info(JSON.stringify({ event: "live_collaboration_listening", port, address }));
    return server;
  }).catch((error) => {
    holder.__wikiSocketServer = undefined;
    console.error(JSON.stringify({ event: "live_collaboration_start_failed", port, reason: error instanceof Error ? error.message : "unknown" }));
    throw error;
  });
  return holder.__wikiSocketServer;
}
