"use client";

import { useCallback, useRef, useState } from "react";

export type UploadProgress =
  | { phase: "idle" }
  | { phase: "uploading"; sentBytes: number; totalBytes: number; resumed: boolean }
  | { phase: "processing" }
  | { phase: "error"; code: string; resumable: boolean };

type Declaration = { participantsInformed: boolean; aiProcessing: boolean };
type StoredUpload = { uploadId: string; chunkBytes: number; chunkCount: number };

const RETRIES_PER_CHUNK = 4;
/** The server refuses these for good; anything else (network, 5xx, a bad chunk) can be resumed. */
const FINAL_ERRORS = new Set(["state", "notFound", "forbidden", "invalid", "type", "tooLarge", "declaration", "quota", "disk"]);

async function sha256Hex(data: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Best effort: an upload left behind is also cleaned up when its session expires. */
async function discard(uploadId: string) {
  try { await fetch(`/api/meeting-uploads/${uploadId}`, { method: "DELETE" }); } catch { /* expires on its own */ }
}

async function errorCode(response: Response) {
  try { return ((await response.json()) as { error?: string }).error ?? `http${response.status}`; } catch { return `http${response.status}`; }
}

/*
 * The upload session of a file is remembered per tab, so choosing the same
 * file again after a failure or a reload continues it. Storage may be
 * unavailable (private mode, blocked site data); then there is no resume.
 */
const storageKey = (meetingId: string, file: File) => `meeting-upload:${meetingId}:${file.name}:${file.size}:${file.lastModified}`;

function remembered(key: string): StoredUpload | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? "null") as StoredUpload | null;
    return value && typeof value.uploadId === "string" && value.chunkBytes > 0 && value.chunkCount > 0 ? value : null;
  } catch { return null; }
}
function remember(key: string, value: StoredUpload) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* no resume then */ }
}
function forget(key: string) {
  try { sessionStorage.removeItem(key); } catch { /* nothing stored */ }
}

/**
 * The server's view of a remembered upload: the chunks it has, null when the
 * session cannot continue, or "offline" when the server was not reachable.
 */
async function serverState(stored: StoredUpload) {
  let response: Response;
  try { response = await fetch(`/api/meeting-uploads/${stored.uploadId}`); } catch { return "offline" as const; }
  if (!response.ok) return response.status >= 500 ? "offline" as const : null;
  try {
    const body = await response.json() as { state: string; receivedChunks: number[]; chunkCount: number };
    if (body.chunkCount !== stored.chunkCount) return null;
    return { state: body.state, received: new Set(body.receivedChunks) };
  } catch { return null; }
}

/**
 * Uploads a recording in chunks below the proxy request limit. Each chunk is
 * hashed in the browser and verified by the server; a failed chunk is resent
 * a few times before the upload reports an error. The session then stays
 * open: resuming (or choosing the same file again) sends only missing chunks.
 */
export function useChunkedUpload(onDone: () => void) {
  const [progress, setProgress] = useState<UploadProgress>({ phase: "idle" });
  const cancelled = useRef(false);
  const last = useRef<{ meetingId: string; file: File; declaration: Declaration } | null>(null);

  const upload = useCallback(async (meetingId: string, file: File, declaration: Declaration) => {
    cancelled.current = false;
    last.current = { meetingId, file, declaration };
    const key = storageKey(meetingId, file);
    setProgress({ phase: "uploading", sentBytes: 0, totalBytes: file.size, resumed: false });

    let stored = remembered(key);
    let received = new Set<number>();
    if (stored) {
      const server = await serverState(stored);
      if (server === "offline") { setProgress({ phase: "error", code: "network", resumable: true }); return; }
      if (server && server.state !== "uploading" && server.state !== "aborted") {
        // All chunks arrived before; the server is already assembling or done.
        forget(key);
        setProgress({ phase: "processing" });
        onDone();
        return;
      }
      if (server?.state === "uploading") received = server.received;
      else { forget(key); stored = null; }
    }
    if (!stored) {
      let init: Response;
      try {
        init = await fetch("/api/meeting-uploads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ meetingId, fileName: file.name, mimeType: file.type, sizeBytes: file.size, declaration }),
        });
      } catch {
        setProgress({ phase: "error", code: "network", resumable: true });
        return;
      }
      if (!init.ok) {
        const code = await errorCode(init);
        setProgress({ phase: "error", code, resumable: !FINAL_ERRORS.has(code) });
        return;
      }
      stored = await init.json() as StoredUpload;
      remember(key, stored);
    }
    const { uploadId, chunkBytes, chunkCount } = stored;
    const chunkSize = (index: number) => Math.min(file.size, (index + 1) * chunkBytes) - index * chunkBytes;
    const giveUp = (code: string) => {
      if (code === "cancelled" || FINAL_ERRORS.has(code)) {
        // A session that cannot finish only holds reserved space.
        forget(key);
        void discard(uploadId);
      }
      setProgress(code === "cancelled" ? { phase: "idle" } : { phase: "error", code, resumable: !FINAL_ERRORS.has(code) });
    };
    let sent = [...received].reduce((sum, index) => sum + chunkSize(index), 0);
    const resumed = received.size > 0;
    setProgress({ phase: "uploading", sentBytes: sent, totalBytes: file.size, resumed });
    for (let index = 0; index < chunkCount; index++) {
      if (cancelled.current) { giveUp("cancelled"); return; }
      if (received.has(index)) continue;
      const blob = file.slice(index * chunkBytes, Math.min(file.size, (index + 1) * chunkBytes));
      const bytes = await blob.arrayBuffer();
      const hash = await sha256Hex(bytes);
      let ok = false;
      let lastCode = "chunk";
      for (let attempt = 0; attempt < RETRIES_PER_CHUNK && !ok; attempt++) {
        try {
          const response = await fetch(`/api/meeting-uploads/${uploadId}/chunks/${index}`, {
            method: "PUT", headers: { "x-chunk-sha256": hash, "Content-Type": "application/octet-stream" }, body: bytes,
          });
          ok = response.ok;
          if (!ok) {
            lastCode = await errorCode(response);
            if (response.status === 404 || response.status === 403 || response.status === 409) break;
          }
        } catch {
          lastCode = "network";
        }
        if (!ok) await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
      }
      if (cancelled.current) { giveUp("cancelled"); return; }
      if (!ok) { giveUp(lastCode); return; }
      sent += blob.size;
      setProgress({ phase: "uploading", sentBytes: sent, totalBytes: file.size, resumed });
    }
    let complete: Response;
    try {
      complete = await fetch(`/api/meeting-uploads/${uploadId}/complete`, { method: "POST" });
    } catch {
      giveUp("network");
      return;
    }
    if (!complete.ok) { giveUp(await errorCode(complete)); return; }
    forget(key);
    setProgress({ phase: "processing" });
    onDone();
  }, [onDone]);

  /** Continues the last upload in this tab with the chunks the server is still missing. */
  const resume = useCallback(() => {
    if (last.current) void upload(last.current.meetingId, last.current.file, last.current.declaration);
  }, [upload]);
  const cancel = useCallback(() => { cancelled.current = true; }, []);
  /** Dismissing a failed upload gives it up, so its reserved space is freed at once. */
  const reset = useCallback(() => {
    const previous = last.current;
    last.current = null;
    if (previous) {
      const key = storageKey(previous.meetingId, previous.file);
      const stored = remembered(key);
      forget(key);
      if (stored) void discard(stored.uploadId);
    }
    setProgress({ phase: "idle" });
  }, []);
  return { progress, upload, resume, cancel, reset };
}
