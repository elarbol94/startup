import * as Y from "yjs";
import { and, eq, isNull } from "drizzle-orm";
import { db, sqlite } from "@/db";
import { user, session, wikiPages, wikiPresentations, wikiPresentationRevisions } from "@/db/schema";
import { requirePresentationAccess } from "../presentation-access";
import { savePageContentInternal } from "../page-content-store";
import { parseStoredDocument } from "../lib/tiptap";
import { parseEditorDocument } from "../lib/editor-document";
import { withDocumentSectionIds } from "../lib/document-sections";
import { parseDocumentSettings } from "../lib/document-settings";
import { defaultPresentationSettings, parsePresentationCanvas, parsePresentationSteps, presentationSnapshotSchema, type PresentationSnapshot } from "../lib/presentation";
import { getAttachment } from "@/lib/files";
import { decode, encode, documentJSON, presentationJSON, patchPresentation, seedPage, type Kind } from "./codec";

export type Viewer = { id: string; role?: string | null; name?: string };
type Room = { key: string; state: Buffer; sequence: number };
export function roomKey(kind: Kind, id: string) { return `${kind}:${id}`; }
export function roomExists(kind: Kind, id: string) {
  return !!sqlite.prepare("SELECT 1 FROM wiki_collaboration_rooms WHERE key = ?").get(roomKey(kind, id));
}
export function authorize(kind: Kind, id: string, viewer: Viewer, sessionId?: string) {
  const account = db.select().from(user).where(eq(user.id, viewer.id)).get();
  if (!account || account.removedAt || account.banned) throw new Error("Access denied");
  if (sessionId && sessionId !== "local-development-session") {
    const login = db.select().from(session).where(and(eq(session.id, sessionId), eq(session.userId, viewer.id))).get();
    if (!login || login.expiresAt.getTime() <= Date.now()) throw new Error("Access denied");
  }
  if (kind === "presentation") requirePresentationAccess(id, account, "edit");
  else if (!db.select({ id: wikiPages.id }).from(wikiPages).where(and(eq(wikiPages.id, id), isNull(wikiPages.deletedAt))).get()) throw new Error("Page unavailable");
}
function sourceDocument(kind: Kind, id: string) {
  const doc = new Y.Doc();
  if (kind === "page") {
    const row = db.select().from(wikiPages).where(eq(wikiPages.id, id)).get()!;
    seedPage(doc, withDocumentSectionIds(parseStoredDocument(row.contentJson)), row.documentMode, parseDocumentSettings(row.documentSettingsJson) as unknown as Record<string, unknown>);
  } else {
    const row = db.select().from(wikiPresentations).where(eq(wikiPresentations.id, id)).get()!;
    patchPresentation(doc, { title: "", elements: [], steps: [], background: "", settings: {} as PresentationSnapshot["settings"] }, { ...parsePresentationCanvas(row.elementsJson), steps: parsePresentationSteps(row.pathJson), title: row.title });
    // Defaults must exist even if they equal the empty seed's primitive fields.
    if (!doc.getMap("settings").has("background")) doc.getMap("settings").set("background", "");
    if (!doc.getMap("settings").has("settings")) doc.getMap("settings").set("settings", defaultPresentationSettings);
  }
  return doc;
}
export function loadRoom(kind: Kind, id: string): Room {
  return sqlite.transaction(() => {
    const key = roomKey(kind, id);
    let row = sqlite.prepare("SELECT * FROM wiki_collaboration_rooms WHERE key = ?").get(key) as Room | undefined;
    if (!row) {
      const doc = sourceDocument(kind, id);
      row = { key, state: Buffer.from(Y.encodeStateAsUpdate(doc)), sequence: 0 };
      doc.destroy();
      sqlite.prepare("INSERT INTO wiki_collaboration_rooms (key, state, sequence) VALUES (?, ?, 0)").run(key, row.state);
    }
    return row;
  }).immediate();
}
function project(kind: Kind, id: string, doc: Y.Doc, viewer: Viewer) {
  if (kind === "page") {
    const contentJson = JSON.stringify(documentJSON(doc));
    if (contentJson.length > 2_000_000) throw new Error("Document too large");
    parseEditorDocument(contentJson);
    const layout = doc.getMap("layout").toJSON();
    const row = db.select().from(wikiPages).where(eq(wikiPages.id, id)).get()!;
    const result = savePageContentInternal({ id, contentJson, documentMode: layout.documentMode, documentSettingsJson: JSON.stringify(layout.settings), expectedContentVersion: row.contentVersion, editorSessionId: "collaboration-server" }, viewer, true);
    if (!result.saved) throw new Error("Document save failed");
  } else {
    const snapshot = presentationSnapshotSchema.parse(presentationJSON(doc));
    const current = db.select().from(wikiPresentations).where(eq(wikiPresentations.id, id)).get()!;
    const previousMedia = new Set(parsePresentationCanvas(current.elementsJson).elements.flatMap(element => "attachmentId" in element.content ? [`${element.type}:${element.content.attachmentId}`] : []));
    for (const element of snapshot.elements) {
      if (!("attachmentId" in element.content) || previousMedia.has(`${element.type}:${element.content.attachmentId}`)) continue;
      const attachment = getAttachment(element.content.attachmentId);
      if (!attachment || !(attachment.entityType === "wikiPage" || attachment.entityType === "wikiPresentationLibrary" || attachment.entityType === "wikiPresentation" && attachment.entityId === id) || !attachment.mimeType.startsWith(`${element.type}/`)) throw new Error("Presentation media unavailable");
    }
    const recent = sqlite.prepare("SELECT 1 FROM wiki_presentation_revisions WHERE presentation_id = ? AND created_at > ? LIMIT 1").get(id, Date.now() - 60_000);
    if (!recent) db.insert(wikiPresentationRevisions).values({ presentationId: id, title: current.title, elementsJson: current.elementsJson, pathJson: current.pathJson, createdBy: viewer.id }).run();
    db.update(wikiPresentations).set({ title: snapshot.title, elementsJson: JSON.stringify({ elements: snapshot.elements, background: snapshot.background, settings: snapshot.settings }), pathJson: JSON.stringify(snapshot.steps), updatedBy: viewer.id, updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1)) }).where(eq(wikiPresentations.id, id)).run();
  }
}
function commit(kind: Kind, id: string, room: Room, doc: Y.Doc, viewer: Viewer) {
  if (kind === "page") {
    const content = documentJSON(doc);
    parseEditorDocument(JSON.stringify(content));
    const normalized = withDocumentSectionIds(content);
    const headings: string[] = [];
    const collect = (node: typeof content) => { if (node.type === "heading") headings.push(String(node.attrs?.id)); node.content?.forEach(collect); };
    collect(normalized);
    let index = 0;
    const visit = (fragment: Y.XmlFragment | Y.XmlElement) => {
      for (const child of fragment.toArray()) if (child instanceof Y.XmlElement) {
        if (child.nodeName === "heading") { const id = headings[index++]; if (child.getAttribute("id") !== id) child.setAttribute("id", id); }
        visit(child);
      }
    };
    doc.transact(() => visit(doc.getXmlFragment("body")));
  }
  const state = Buffer.from(Y.encodeStateAsUpdate(doc));
  if (state.length > 8_000_000) throw new Error("Collaboration state too large");
  if (state.equals(room.state)) return room;
  project(kind, id, doc, viewer);
  const sequence = room.sequence + 1;
  const base = new Y.Doc();
  Y.applyUpdate(base, room.state);
  const update = Buffer.from(Y.encodeStateAsUpdate(doc, Y.encodeStateVector(base)));
  base.destroy();
  sqlite.prepare("UPDATE wiki_collaboration_rooms SET state = ?, sequence = ? WHERE key = ?").run(state, sequence, room.key);
  sqlite.prepare('INSERT INTO wiki_collaboration_updates (room, sequence, "update") VALUES (?, ?, ?)').run(room.key, sequence, update);
  // The current snapshot is always durable; retain a bounded replay tail.
  sqlite.prepare("DELETE FROM wiki_collaboration_updates WHERE room = ? AND sequence <= ?").run(room.key, sequence - 100);
  return { key: room.key, state, sequence };
}
export function applyRoomUpdate(kind: Kind, id: string, update: string, viewer: Viewer) {
  return sqlite.transaction(() => {
    authorize(kind, id, viewer);
    const room = loadRoom(kind, id);
    const doc = new Y.Doc();
    try {
      Y.applyUpdate(doc, room.state);
      Y.applyUpdate(doc, decode(update));
      if (doc.store.pendingStructs || doc.store.pendingDs) throw new Error("Synchronization required");
      return commit(kind, id, room, doc, viewer);
    } finally { doc.destroy(); }
  }).immediate();
}
// Server-side restoration and notes edits enter the same ordered update stream.
export function mutateRoom(kind: Kind, id: string, viewer: Viewer, mutate: (doc: Y.Doc) => void) {
  return sqlite.transaction(() => {
    authorize(kind, id, viewer);
    const room = loadRoom(kind, id);
    const doc = new Y.Doc();
    try { Y.applyUpdate(doc, room.state); mutate(doc); return commit(kind, id, room, doc, viewer); }
    finally { doc.destroy(); }
  }).immediate();
}
export function wireRoom(room: Room) { return { update: encode(room.state), sequence: room.sequence }; }
export function replayRoom(kind: Kind, id: string, after: number) {
  const room = loadRoom(kind, id);
  if (after === room.sequence) return null;
  const rows = sqlite.prepare('SELECT sequence, "update" FROM wiki_collaboration_updates WHERE room = ? AND sequence > ? ORDER BY sequence').all(room.key, after) as { sequence: number; update: Buffer }[];
  if (!rows.length || rows[0].sequence !== after + 1) return wireRoom(room);
  return { update: encode(Y.mergeUpdates(rows.map(row => row.update))), sequence: room.sequence };
}
