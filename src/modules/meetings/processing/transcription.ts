import "server-only";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BlockedJobError } from "./jobs";
import { cutAudio, cutWavClip, detectSilences } from "./media-tools";
import { keySegments, planChunks, referenceClips, type KeyedSegment, type RawSegment } from "./chunks";

export type TranscriptionResult = { engine: string; model: string; segments: KeyedSegment[] };

type KnownSpeaker = { name: string; dataUrl: string };
type ChunkRequest = { file: string; language: string; knownSpeakers: KnownSpeaker[]; signal: AbortSignal };

const MAX_CHUNK_MS = Math.max(60_000, Number(process.env.MEETINGS_TRANSCRIBE_CHUNK_SECONDS || 1200) * 1000);

/** True when tests and local development use deterministic fixture output. */
export const fakeAiEnabled = () => process.env.MEETINGS_FAKE_AI === "1";

async function transcribeChunkWithOpenAI(request: ChunkRequest): Promise<{ model: string; segments: RawSegment[] }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new BlockedJobError("OPENAI_API_KEY is not configured");
  const model = process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || "gpt-4o-transcribe-diarize";
  const form = new FormData();
  form.set("model", model);
  form.set("file", new Blob([new Uint8Array(await fs.readFile(request.file))], { type: "audio/ogg" }), path.basename(request.file));
  form.set("response_format", "diarized_json");
  form.set("chunking_strategy", "auto");
  if (request.language) form.set("language", request.language);
  for (const speaker of request.knownSpeakers) {
    form.append("known_speaker_names[]", speaker.name);
    form.append("known_speaker_references[]", speaker.dataUrl);
  }
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.any([request.signal, AbortSignal.timeout(15 * 60_000)]),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    if (response.status === 401 || response.status === 403) throw new BlockedJobError(`OpenAI rejected the API key (${response.status})`);
    throw new Error(`Transcription failed (${response.status}): ${detail}`);
  }
  const payload = await response.json() as { segments?: Array<{ start?: number; end?: number; speaker?: string; text?: string }> };
  return {
    model,
    segments: (payload.segments ?? []).map((segment) => ({
      startMs: Math.round(Number(segment.start ?? 0) * 1000),
      endMs: Math.round(Number(segment.end ?? 0) * 1000),
      speaker: String(segment.speaker ?? "A"),
      text: String(segment.text ?? ""),
    })),
  };
}

function fakeChunk(chunkIndex: number): { model: string; segments: RawSegment[] } {
  return {
    model: "fake",
    segments: [
      { startMs: 0, endMs: 4_000, speaker: chunkIndex === 0 ? "A" : "SPK1", text: "Willkommen zum Meeting. Wir besprechen heute die Förderung." },
      { startMs: 4_000, endMs: 9_000, speaker: chunkIndex === 0 ? "B" : "SPK2", text: "Ich schicke den Antrag bis Freitag an das Land." },
      { startMs: 9_000, endMs: 12_000, speaker: chunkIndex === 0 ? "A" : "SPK1", text: "Gut, dann ist das beschlossen." },
    ],
  };
}

/**
 * Transcribes a speech-audio file chunk by chunk. `beforeRequest` runs before
 * every external call and throws when the job lost its lease or the meeting's
 * AI policy no longer allows the call.
 */
export async function transcribeAudio(input: {
  file: string;
  durationMs: number;
  language: string;
  signal: AbortSignal;
  beforeRequest: () => void;
}): Promise<TranscriptionResult> {
  const fake = fakeAiEnabled();
  const silences = !fake && input.durationMs > MAX_CHUNK_MS ? await detectSilences(input.file, 700, input.signal) : [];
  const chunks = planChunks(input.durationMs, silences, MAX_CHUNK_MS);
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "meeting-transcribe-"));
  try {
    const segments: KeyedSegment[] = [];
    const knownSpeakers: KnownSpeaker[] = [];
    let model = "";
    for (const [index, chunk] of chunks.entries()) {
      input.beforeRequest();
      let result;
      if (fake) result = fakeChunk(index);
      else {
        const chunkFile = chunks.length === 1 ? input.file : path.join(workDir, `chunk-${index}.ogg`);
        if (chunks.length > 1) await cutAudio(input.file, chunkFile, chunk.startMs, chunk.durationMs, input.signal);
        result = await transcribeChunkWithOpenAI({ file: chunkFile, language: input.language, knownSpeakers, signal: input.signal });
        if (chunkFile !== input.file) await fs.rm(chunkFile, { force: true });
      }
      model = result.model;
      const keyed = keySegments(index, chunk, result.segments, knownSpeakers.map((speaker) => speaker.name));
      segments.push(...keyed);
      if (index === 0 && chunks.length > 1 && !fake) {
        // Clips of the first chunk's speakers keep their names stable later on.
        for (const clip of referenceClips(keyed)) {
          const clipFile = path.join(workDir, `${clip.name}.wav`);
          await cutWavClip(input.file, clipFile, clip.startMs, clip.durationMs, input.signal);
          knownSpeakers.push({ name: clip.name, dataUrl: `data:audio/wav;base64,${(await fs.readFile(clipFile)).toString("base64")}` });
          await fs.rm(clipFile, { force: true });
        }
      }
    }
    return { engine: fake ? "fake" : "openai", model, segments };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}
