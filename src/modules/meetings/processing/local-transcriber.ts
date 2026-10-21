import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import type { JobProgress } from "../job-progress";
import type { RawSegment } from "./chunks";

/**
 * Client of the self-hosted transcriber on the homeserver GPU
 * (deploy/transcriber): Whisper plus pyannote speaker separation. The worker
 * uploads the whole recording, polls the job for progress and fetches the
 * result. Every failure is a LocalTranscriberError, after which the caller
 * falls back to OpenAI; lease and policy errors from `beforePoll` pass through.
 */
export class LocalTranscriberError extends Error {}

type RemoteJob = {
  id: string;
  status: "queued" | "running" | "done" | "failed";
  phase: string;
  progress: number;
  position?: number;
  error?: string | null;
  result?: { model: string; language: string | null; segments: Array<{ start: number; end: number; speaker: string; text: string }> };
};

export const POLL_MS = 5_000;
/** About half a minute without an answer counts as the service being down. */
const MAX_POLL_FAILURES = 6;

export const localTranscriberUrl = () => process.env.MEETINGS_TRANSCRIBER_URL?.trim().replace(/\/+$/, "") || null;

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    signal.addEventListener("abort", abort, { once: true });
  });
}

export async function transcribeWithLocalService(input: {
  file: string;
  durationMs: number;
  language: string;
  /** Punctuated context (title, participants) that steers spelling and punctuation. */
  prompt: string;
  /** False for a call track with one known speaker: no speaker separation needed. */
  diarize: boolean;
  /** Stable per worker job, so a retried job gets the running remote job back. */
  key: string;
  signal: AbortSignal;
  beforePoll: () => void;
  onProgress?: (progress: JobProgress) => void;
  pollMs?: number;
}): Promise<{ model: string; language: string | null; segments: RawSegment[] }> {
  const base = localTranscriberUrl();
  if (!base) throw new LocalTranscriberError("The local transcriber is not configured");
  const headers = { Authorization: `Bearer ${process.env.MEETINGS_TRANSCRIBER_TOKEN?.trim() ?? ""}` };
  const audio = new Blob([new Uint8Array(await fs.readFile(input.file))], { type: "audio/ogg" });

  async function call(method: string, pathname: string, body?: FormData): Promise<RemoteJob> {
    let response: Response;
    try {
      response = await fetch(`${base}${pathname}`, { method, headers, body, signal: AbortSignal.any([input.signal, AbortSignal.timeout(120_000)]) });
    } catch (error) {
      if (input.signal.aborted) throw error;
      throw new LocalTranscriberError(`The local transcriber is unreachable (${error instanceof Error ? error.message : String(error)})`);
    }
    if (response.status === 404) throw new LocalTranscriberError("404");
    if (!response.ok) throw new LocalTranscriberError(`The local transcriber answered ${response.status}: ${(await response.text()).slice(0, 200)}`);
    return await response.json() as RemoteJob;
  }
  const submit = () => {
    const form = new FormData();
    form.set("file", audio, path.basename(input.file));
    form.set("key", input.key);
    form.set("language", input.language);
    form.set("prompt", input.prompt);
    form.set("diarize", input.diarize ? "true" : "false");
    return call("POST", "/jobs", form);
  };

  input.beforePoll();
  const submittedAt = Date.now();
  let job = await submit();
  // Queue wait plus generous room: on the P620 a recording takes about a third of its length.
  const deadline = submittedAt + 15 * 60_000 + input.durationMs;
  let runningSince: number | null = null;
  let failures = 0;
  try {
    while (job.status !== "done") {
      if (job.status === "failed") throw new LocalTranscriberError(`Local transcription failed: ${job.error ?? "unknown error"}`);
      if (Date.now() > deadline) throw new LocalTranscriberError("Local transcription took too long");
      if (job.status === "running") runningSince ??= Date.now();
      input.onProgress?.(job.status === "queued"
        ? { step: "local", phase: "queued", fraction: 0, position: job.position ?? 0, startedAt: submittedAt }
        : { step: "local", phase: job.phase === "diarizing" ? "diarizing" : "transcribing", fraction: Math.min(1, Math.max(0, job.progress)), position: 0, startedAt: runningSince ?? Date.now() });
      await sleep(input.pollMs ?? POLL_MS, input.signal);
      input.beforePoll();
      try {
        // A 404 means the service restarted and lost the job: hand it in again.
        job = await call("GET", `/jobs/${job.id}`).catch((error) => error instanceof LocalTranscriberError && error.message === "404" ? submit() : Promise.reject(error));
        failures = 0;
      } catch (error) {
        if (!(error instanceof LocalTranscriberError) || ++failures >= MAX_POLL_FAILURES) throw error;
      }
    }
  } finally {
    // Frees the result on the homeserver; a running job is left to finish.
    void call("DELETE", `/jobs/${job.id}`).catch(() => undefined);
  }
  const result = job.result;
  if (!result) throw new LocalTranscriberError("The local transcriber returned no result");
  return {
    model: result.model,
    language: result.language,
    segments: result.segments.map((segment) => ({
      startMs: Math.round(segment.start * 1000),
      endMs: Math.round(segment.end * 1000),
      speaker: segment.speaker,
      text: segment.text,
    })),
  };
}
