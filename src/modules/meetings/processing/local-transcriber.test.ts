import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { LocalTranscriberError, transcribeWithLocalService } from "./local-transcriber";
import type { JobProgress } from "../job-progress";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "local-transcriber-"));
const file = path.join(dir, "audio.ogg");
fs.writeFileSync(file, "OggS");
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

type Reply = { status?: number; body?: unknown } | Error;
let replies: Reply[];
let requests: Array<{ method: string; url: string }>;

beforeEach(() => {
  process.env.MEETINGS_TRANSCRIBER_URL = "http://transcriber.test:8790/";
  process.env.MEETINGS_TRANSCRIBER_TOKEN = "secret";
  requests = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    requests.push({ method: init.method ?? "GET", url });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret");
    if (init.method === "DELETE") return new Response("{}");
    const reply = replies.shift();
    if (!reply) throw new Error("unexpected request");
    if (reply instanceof Error) throw reply;
    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status ?? 200 });
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MEETINGS_TRANSCRIBER_URL;
});

const job = (status: string, extra: object = {}) => ({ body: { id: "j1", status, phase: status, progress: 0, ...extra } });
const run = (overrides: Partial<Parameters<typeof transcribeWithLocalService>[0]> = {}) => transcribeWithLocalService({
  file, durationMs: 60_000, language: "de", prompt: "Besprechung: Test.", diarize: true, key: "transcribe:r1:1",
  signal: new AbortController().signal, beforePoll: () => {}, pollMs: 1, ...overrides,
});

describe("local transcriber client", () => {
  it("uploads, reports progress and returns the segments in milliseconds", async () => {
    replies = [
      job("queued", { position: 2 }),
      job("running", { phase: "diarizing", progress: 0.6 }),
      job("done", { result: { model: "large-v3-turbo+pyannote-3.1", language: "de", segments: [{ start: 1.25, end: 2.5, speaker: "SPEAKER_00", text: "Hallo." }] } }),
    ];
    const progress: JobProgress[] = [];
    const result = await run({ onProgress: (value) => progress.push(value) });
    expect(result).toEqual({ model: "large-v3-turbo+pyannote-3.1", language: "de", segments: [{ startMs: 1250, endMs: 2500, speaker: "SPEAKER_00", text: "Hallo." }] });
    expect(progress.map((value) => value.step === "local" && [value.phase, value.fraction, value.position])).toEqual([["queued", 0, 2], ["diarizing", 0.6, 0]]);
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "POST http://transcriber.test:8790/jobs", "GET http://transcriber.test:8790/jobs/j1", "GET http://transcriber.test:8790/jobs/j1", "DELETE http://transcriber.test:8790/jobs/j1",
    ]);
  });

  it("reports a failed remote job as a reason to fall back", async () => {
    replies = [job("queued"), job("failed", { error: "OutOfMemoryError" })];
    await expect(run()).rejects.toThrow(new LocalTranscriberError("Local transcription failed: OutOfMemoryError"));
  });

  it("treats an unreachable service as a reason to fall back", async () => {
    replies = [new TypeError("fetch failed")];
    await expect(run()).rejects.toBeInstanceOf(LocalTranscriberError);
  });

  it("hands the job in again when the service lost it in a restart", async () => {
    replies = [job("running"), { status: 404, body: { detail: "unknown job" } }, job("queued"), job("done", { result: { model: "m", language: null, segments: [] } })];
    await expect(run()).resolves.toMatchObject({ model: "m" });
    expect(requests.filter((request) => request.method === "POST")).toHaveLength(2);
  });

  it("passes lease and policy errors through instead of falling back", async () => {
    replies = [job("running")];
    const lost = new Error("The job lease was lost");
    let calls = 0;
    await expect(run({ beforePoll: () => { if (++calls > 1) throw lost; } })).rejects.toBe(lost);
  });
});
