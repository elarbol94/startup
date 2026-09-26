// Images inside pasted or dropped HTML. The HTML itself never carries them
// into the document (see lib/paste-html); instead every <img> whose bytes the
// browser can read is turned into a File and uploaded through the same figure
// upload path as pasted image files, right after the inserted content. That
// covers data: URIs, blob: URLs and https images served with CORS. Nothing is
// fetched on the server, so a pasted URL can never make it request internal
// addresses. Images that cannot be read are counted and reported instead.
import type { EditorView } from "@tiptap/pm/view";
import { DOMParser as ProseMirrorDOMParser, type Slice } from "@tiptap/pm/model";
import { isInlineImageFile, normalizeInlineImageFile } from "./wiki-editor-document-ops";
import { anchorRange, resolveAnchoredRange } from "./yjs-anchor";

// Mirrors MAX_UPLOAD_BYTES in src/lib/files.ts, which is server-only; the
// upload route enforces the real limit.
export const PASTED_IMAGE_MAX_BYTES = 50 * 1024 * 1024;
const REMOTE_TIMEOUT_MS = 15_000;
const EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg" };

export type PastedImageKind = "data" | "blob" | "remote" | "unsupported";

export function pastedImageKind(src: string): PastedImageKind {
  const value = src.trim();
  if (/^data:image\//i.test(value)) return "data";
  if (/^blob:/i.test(value)) return "blob";
  if (/^https:\/\//i.test(value)) return "remote";
  return "unsupported";
}

function mimeType(value: string | null | undefined) {
  return (value ?? "").split(";")[0].trim().toLowerCase();
}

function fileName(index: number, type: string) {
  return `pasted-image-${index + 1}.${EXTENSIONS[type] ?? "img"}`;
}

/** Decodes a data: URI (base64 or percent-encoded) into a File, or null. */
export function dataUriToFile(src: string, name: string): File | null {
  const match = /^data:([^,]*),([\s\S]*)$/i.exec(src.trim());
  if (!match) return null;
  const parameters = match[1].split(";").map((part) => part.trim());
  const type = mimeType(parameters[0]);
  const base64 = parameters.slice(1).some((part) => part.toLowerCase() === "base64");
  try {
    let bytes: Uint8Array<ArrayBuffer>;
    if (base64) {
      const binary = atob(match[2].replace(/\s+/g, ""));
      bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    } else bytes = new TextEncoder().encode(decodeURIComponent(match[2]));
    return new File([bytes], name.replace(/\.img$/, `.${EXTENSIONS[type] ?? "img"}`), { type });
  } catch {
    return null;
  }
}

/** A usable upload: an allowed image type within the size limit. */
export function acceptPastedImage(file: File | null): File | null {
  if (!file || !file.size || file.size > PASTED_IMAGE_MAX_BYTES) return null;
  const normalized = normalizeInlineImageFile(file);
  return isInlineImageFile(normalized) ? normalized : null;
}

async function fetchImage(src: string, remote: boolean, name: (type: string) => string, fetcher: typeof fetch): Promise<File | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);
  try {
    // A plain CORS request without cookies: images whose server does not allow
    // this origin are skipped rather than proxied.
    const response = await fetcher(src, remote ? { mode: "cors", credentials: "omit", referrerPolicy: "no-referrer", signal: controller.signal } : { signal: controller.signal });
    if (!response.ok) return null;
    if (Number(response.headers.get("content-length")) > PASTED_IMAGE_MAX_BYTES) return null;
    const blob = await response.blob();
    const type = mimeType(blob.type) || mimeType(response.headers.get("content-type"));
    return new File([blob], name(type), { type });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Reads one pasted image source into an uploadable File, or null when it cannot be imported. */
export async function pastedImageToFile(src: string, index: number, fetcher: typeof fetch = fetch): Promise<File | null> {
  const kind = pastedImageKind(src);
  if (kind === "unsupported") return null;
  if (kind === "data") return acceptPastedImage(dataUriToFile(src, fileName(index, "")));
  return acceptPastedImage(await fetchImage(src.trim(), kind === "remote", (type) => fileName(index, type), fetcher));
}

/** All importable images, in their original order, plus how many had to be skipped. */
export async function collectPastedImages(sources: string[], fetcher: typeof fetch = fetch) {
  const files = await Promise.all(sources.map((src, index) => pastedImageToFile(src, index, fetcher)));
  const imported = files.filter((file): file is File => file !== null);
  return { files: imported, skipped: sources.length - imported.length };
}

/** Parses already sanitized HTML with the schema's own parser, in an inert document. */
export function parseSanitizedHtml(view: EditorView, sanitized: string): Slice {
  // Unlike innerHTML on a live element, an inert document never loads images or runs handlers.
  const container = new window.DOMParser().parseFromString(sanitized, "text/html").body;
  return ProseMirrorDOMParser.fromSchema(view.state.schema).parseSlice(container, { preserveWhitespace: true });
}

/**
 * Uploads the images of pasted/dropped HTML at `position` (normally right
 * after the inserted content). Reading remote images takes a while, so the
 * position is anchored in the collaborative document and resolved once the
 * files are ready.
 */
export async function importPastedImages({ view, sources, position, upload, onSkipped }: {
  view: EditorView;
  sources: string[];
  position: number;
  upload: (files: File[], position: number) => Promise<void> | void;
  onSkipped: (count: number) => void;
}) {
  if (!sources.length) return;
  const anchor = anchorRange(view.state, { from: position, to: position });
  const { files, skipped } = await collectPastedImages(sources);
  if (skipped) onSkipped(skipped);
  if (!files.length || view.isDestroyed) return;
  const resolved = resolveAnchoredRange(view.state, anchor);
  await upload(files, resolved?.to ?? Math.min(position, view.state.doc.content.size));
}
