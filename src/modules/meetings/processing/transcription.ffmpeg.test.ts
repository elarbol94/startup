import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The silence path end to end with the real ffmpeg (the Docker image has it):
// only OpenAI is faked, by a fetch that finds the tones in each uploaded chunk.
vi.hoisted(() => { process.env.MEETINGS_TRANSCRIBE_CHUNK_SECONDS = "60"; });
vi.mock("server-only", () => ({}));
vi.mock("./jobs", () => ({ BlockedJobError: class BlockedJobError extends Error {} }));

import { transcribeAudio } from "./transcription";

const hasFfmpeg = (() => {
  try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return true; } catch { return false; }
})();

/** Tone intervals (s) of the generated 300 s test track; everything else is silent. */
const TONES: Array<[number, number]> = [[0, 40], [100, 140], [250, 290]];
let dir: string;

/** Writes a speech-audio-like Opus track; `tones` are intervals (s) or an ffmpeg expression in t. */
function makeTrack(file: string, tones: Array<[number, number]> | string, seconds: number) {
  const on = typeof tones === "string" ? tones : tones.map(([start, end]) => `between(t,${start},${end})`).join("+") || "0";
  execFileSync("ffmpeg", [
    "-nostdin", "-hide_banner", "-loglevel", "error", "-f", "lavfi",
    "-i", `aevalsrc='if(${on},0.5*sin(2*PI*440*t),0)':s=16000:d=${seconds}`,
    "-ac", "1", "-ar", "16000", "-c:a", "libopus", "-b:a", "24k", "-application", "voip", "-y", file,
  ]);
}

/** Non-silent intervals of an audio file, as a transcription service would report speech. */
function soundIntervals(file: string) {
  const duration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" }));
  // silencedetect reports on stderr; spawnSync keeps it even though ffmpeg writes nothing to stdout.
  const stderr = spawnSync("ffmpeg", ["-nostdin", "-hide_banner", "-i", file, "-af", "silencedetect=noise=-35dB:d=0.3", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const starts = [...stderr.matchAll(/silence_start: ([\d.]+)/g)].map((match) => Number(match[1]));
  const ends = [...stderr.matchAll(/silence_end: ([\d.]+)/g)].map((match) => Number(match[1]));
  const sounds: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  starts.forEach((start, index) => {
    if (start - cursor > 0.3) sounds.push({ start: cursor, end: start });
    cursor = ends[index] ?? duration;
  });
  if (duration - cursor > 0.3) sounds.push({ start: cursor, end: duration });
  return sounds;
}

describe.skipIf(!hasFfmpeg)("transcription with real ffmpeg", () => {
  beforeAll(async () => {
    process.env.MEETINGS_FAKE_AI = "";
    process.env.OPENAI_API_KEY = "test-key";
    process.env.MEETINGS_NICE = "0";
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "transcription-ffmpeg-"));
  });
  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it("cuts long silences, sends chunks of the compacted audio and maps speech back to the original", async () => {
    const file = path.join(dir, "track.ogg");
    makeTrack(file, TONES, 300);
    let requests = 0;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: FormData }) => {
      requests += 1;
      const chunk = path.join(dir, `sent-${requests}.ogg`);
      await fs.writeFile(chunk, Buffer.from(await (init.body.get("file") as Blob).arrayBuffer()));
      const segments = soundIntervals(chunk).map((sound) => ({ ...sound, speaker: "A", text: "Ton" }));
      return new Response(JSON.stringify({ segments }));
    }));

    const result = await transcribeAudio({ file, durationMs: 300_000, language: "de", signal: new AbortController().signal, beforeRequest: () => {} });

    // The two long gaps (60 s and 110 s, minus 1 s padding each side) are left out; chunks are at most 60 s.
    expect(Math.abs(result.skippedMs - 166_000)).toBeLessThan(2_000);
    expect(requests).toBeGreaterThanOrEqual(3);
    // Segments split at chunk cuts are joined again before comparing with the tones.
    const merged: Array<[number, number]> = [];
    for (const segment of [...result.segments].sort((a, b) => a.startMs - b.startMs)) {
      const last = merged.at(-1);
      if (last && segment.startMs - last[1] < 1_500) last[1] = Math.max(last[1], segment.endMs);
      else merged.push([segment.startMs, segment.endMs]);
    }
    expect(merged).toHaveLength(TONES.length);
    merged.forEach(([start, end], index) => {
      expect(Math.abs(start - TONES[index][0] * 1000)).toBeLessThan(500);
      expect(Math.abs(end - TONES[index][1] * 1000)).toBeLessThan(500);
    });
  }, 120_000);

  it("stays within ffmpeg's expression limit when speech is broken up by many silences", async () => {
    // 300 short bursts, each followed by 12 s of silence: more gaps than one filter can hold.
    const file = path.join(dir, "bursts.ogg");
    makeTrack(file, "lt(mod(t,14),2)", 4200);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ segments: [] }))));
    const result = await transcribeAudio({ file, durationMs: 4_200_000, language: "de", signal: new AbortController().signal, beforeRequest: () => {} });
    expect(result.engine).toBe("openai");
    expect(result.skippedMs).toBeGreaterThan(0);
  }, 300_000);

  it("sends nothing for a silent track", async () => {
    const file = path.join(dir, "silent.ogg");
    makeTrack(file, [], 120);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const result = await transcribeAudio({ file, durationMs: 120_000, language: "de", signal: new AbortController().signal, beforeRequest: () => {} });
    expect(result).toMatchObject({ engine: "silence", segments: [] });
    expect(fetch).not.toHaveBeenCalled();
  }, 60_000);
});
