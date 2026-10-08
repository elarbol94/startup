import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const media = vi.hoisted(() => ({
  detectSilences: vi.fn(),
  keepAudioRanges: vi.fn(async (_input: string, output: string) => { await (await import("node:fs/promises")).writeFile(output, "OggS"); }),
  cutAudio: vi.fn(async (_input: string, output: string) => { await (await import("node:fs/promises")).writeFile(output, "OggS"); }),
  cutWavClip: vi.fn(async (_input: string, output: string) => { await (await import("node:fs/promises")).writeFile(output, "RIFF"); }),
}));
vi.mock("server-only", () => ({}));
vi.mock("./media-tools", () => media);

import { transcribeAudio } from "./transcription";

const min = 60_000;
const input = (durationMs: number) => ({ file: "", durationMs, language: "de", signal: new AbortController().signal, beforeRequest: vi.fn() });
let dir: string;
let file: string;

beforeEach(async () => {
  vi.stubEnv("MEETINGS_FAKE_AI", "");
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "transcription-test-"));
  file = path.join(dir, "audio.ogg");
  await fs.writeFile(file, "OggS");
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("transcribeAudio without silence", () => {
  it("never calls OpenAI for a silent track", async () => {
    media.detectSilences.mockResolvedValue([{ startMs: 0, endMs: 120 * min }]);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const result = await transcribeAudio({ ...input(120 * min), file });
    expect(result).toMatchObject({ engine: "silence", segments: [], skippedMs: 120 * min });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends only the speech and puts the timestamps back on the original timeline", async () => {
    // Speech in the first and the last minute of a 30-minute track.
    media.detectSilences.mockResolvedValue([{ startMs: min, endMs: 29 * min }]);
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      segments: [
        { start: 1, end: 3, speaker: "A", text: "Hallo zusammen" },
        { start: 62, end: 64, speaker: "A", text: "Bis morgen" },
      ],
    })));
    vi.stubGlobal("fetch", fetch);
    const result = await transcribeAudio({ ...input(30 * min), file });
    expect(media.keepAudioRanges).toHaveBeenCalledWith(file, expect.stringContaining("compact.ogg"),
      [{ startMs: 0, endMs: min + 1000 }, { startMs: 29 * min - 1000, endMs: 30 * min }], 30 * min, expect.anything());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.skippedMs).toBe(28 * min - 2000);
    // 62 s in the compacted audio is 1 s into the second kept range.
    expect(result.segments).toEqual([
      { startMs: 1000, endMs: 3000, speakerKey: "SPK1", text: "Hallo zusammen" },
      { startMs: 29 * min, endMs: 29 * min + 2000, speakerKey: "SPK1", text: "Bis morgen" },
    ]);
  });
});
