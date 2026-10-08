"use client";

import { useCallback, useRef, useState } from "react";

export type UploadProgress =
  | { phase: "idle" }
  | { phase: "uploading"; sentBytes: number; totalBytes: number }
  | { phase: "processing" }
  | { phase: "error"; code: string };

const RETRIES_PER_CHUNK = 4;

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

/**
 * Uploads a recording in chunks below the proxy request limit. Each chunk is
 * hashed in the browser and verified by the server; a failed chunk is resent
 * a few times before the upload reports an error.
 */
export function useChunkedUpload(onDone: () => void) {
  const [progress, setProgress] = useState<UploadProgress>({ phase: "idle" });
  const cancelled = useRef(false);

  const upload = useCallback(async (meetingId: string, file: File, declaration: { participantsInformed: boolean; aiProcessing: boolean }) => {
    cancelled.current = false;
    setProgress({ phase: "uploading", sentBytes: 0, totalBytes: file.size });
    let init: Response;
    try {
      init = await fetch("/api/meeting-uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId, fileName: file.name, mimeType: file.type, sizeBytes: file.size, declaration }),
      });
    } catch {
      setProgress({ phase: "error", code: "network" });
      return;
    }
    if (!init.ok) { setProgress({ phase: "error", code: await errorCode(init) }); return; }
    const { uploadId, chunkBytes, chunkCount } = await init.json() as { uploadId: string; chunkBytes: number; chunkCount: number };
    // There is no resume: a session that cannot finish only holds reserved space.
    const giveUp = (code: string) => {
      void discard(uploadId);
      setProgress(code === "cancelled" ? { phase: "idle" } : { phase: "error", code });
    };
    let sent = 0;
    for (let index = 0; index < chunkCount; index++) {
      if (cancelled.current) { giveUp("cancelled"); return; }
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
      setProgress({ phase: "uploading", sentBytes: sent, totalBytes: file.size });
    }
    let complete: Response;
    try {
      complete = await fetch(`/api/meeting-uploads/${uploadId}/complete`, { method: "POST" });
    } catch {
      giveUp("network");
      return;
    }
    if (!complete.ok) { giveUp(await errorCode(complete)); return; }
    setProgress({ phase: "processing" });
    onDone();
  }, [onDone]);

  const cancel = useCallback(() => { cancelled.current = true; }, []);
  const reset = useCallback(() => setProgress({ phase: "idle" }), []);
  return { progress, upload, cancel, reset };
}
