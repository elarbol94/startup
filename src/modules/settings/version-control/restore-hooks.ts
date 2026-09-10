import { sqlite } from "@/db";
import { recoverAttachmentVersion } from "@/lib/files";
import { mutateRoom } from "@/modules/wiki/collaboration/store";
import { patchPresentation, presentationJSON, seedPage } from "@/modules/wiki/collaboration/codec";
import { parseStoredDocument } from "@/modules/wiki/lib/tiptap";
import { parseDocumentSettings } from "@/modules/wiki/lib/document-settings";
import { parsePresentationCanvas, parsePresentationSteps } from "@/modules/wiki/lib/presentation";
import { RestoreError, type RestoreHook } from "./store";
import { quote } from "./journal";

export const restoreHook: RestoreHook = (table, target, current, actorId) => {
  if (table === "attachments") {
    const storedName = recoverAttachmentVersion(String(target.stored_name), String(target.sha256));
    if (!storedName) throw new RestoreError("fileMissing");
    target.stored_name = storedName;
    return false;
  }
  if (table !== "wiki_pages" && table !== "wiki_presentations") return false;
  if (table === "wiki_pages" && target.deleted_at) throw new RestoreError("dependencies");
  if (!current) {
    const fields = Object.keys(target);
    sqlite.prepare(`INSERT INTO ${quote(table)} (${fields.map(quote).join(",")}) VALUES (${fields.map(() => "?").join(",")})`).run(...fields.map(field => target[field]));
  }
  const id = String(target.id);
  const viewer = { id: actorId, role: "admin" };
  if (table === "wiki_pages") {
    const fields = Object.keys(target).filter(field => !["id", "content_json", "content_text", "document_mode", "document_settings_json", "content_version"].includes(field));
    sqlite.prepare(`UPDATE wiki_pages SET ${fields.map(field => `${quote(field)} = ?`).join(",")} WHERE id = ?`).run(...fields.map(field => target[field]), id);
    mutateRoom("page", id, viewer, doc => seedPage(doc, parseStoredDocument(String(target.content_json)), Boolean(target.document_mode), parseDocumentSettings(String(target.document_settings_json)) as unknown as Record<string, unknown>));
    // A title-only restore may leave the shared document unchanged, so refresh FTS too.
    const row = sqlite.prepare("SELECT title, content_text FROM wiki_pages WHERE id = ?").get(id) as { title: string; content_text: string };
    sqlite.prepare("DELETE FROM wiki_pages_fts WHERE page_id = ?").run(id);
    sqlite.prepare("INSERT INTO wiki_pages_fts (page_id, title, content_text) VALUES (?, ?, ?)").run(id, row.title, row.content_text);
  } else {
    mutateRoom("presentation", id, viewer, doc => patchPresentation(doc, presentationJSON(doc), {
      ...parsePresentationCanvas(String(target.elements_json)), title: String(target.title), steps: parsePresentationSteps(String(target.path_json)),
    }));
  }
  return true;
};
