import "server-only";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BlockedJobError } from "./jobs";
import { cutAudio, cutWavClip, detectSilences, keepAudioRanges } from "./media-tools";
import { keySegments, planChunks, referenceClips, type KeyedSegment, type RawSegment } from "./chunks";
import { planTranscription, segmentsToOriginal } from "./silence";

export type TranscriptionResult = {
  engine: string;
  model: string;
  segments: KeyedSegment[];
  /** Silence left out before sending the audio (ms). */
  skippedMs: number;
  /** Language OpenAI reported, when it reports one. */
  detectedLanguage: string | null;
};

type KnownSpeaker = { name: string; dataUrl: string };
type ChunkRequest = { file: string; language: string; knownSpeakers: KnownSpeaker[]; signal: AbortSignal };

const MAX_CHUNK_MS = Math.max(60_000, Number(process.env.MEETINGS_TRANSCRIBE_CHUNK_SECONDS || 1200) * 1000);

/** True when tests and local development use deterministic fixture output. */
export const fakeAiEnabled = () => process.env.MEETINGS_FAKE_AI === "1";

type ChunkResult = { model: string; segments: RawSegment[]; language?: string | null };

async function transcribeChunkWithOpenAI(request: ChunkRequest): Promise<ChunkResult> {
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
  const payload = await response.json() as { language?: string; segments?: Array<{ start?: number; end?: number; speaker?: string; text?: string }> };
  return {
    model,
    language: typeof payload.language === "string" ? payload.language : null,
    segments: (payload.segments ?? []).map((segment) => ({
      startMs: Math.round(Number(segment.start ?? 0) * 1000),
      endMs: Math.round(Number(segment.end ?? 0) * 1000),
      speaker: String(segment.speaker ?? "A"),
      text: String(segment.text ?? ""),
    })),
  };
}

function fakeChunk(chunkIndex: number): ChunkResult {
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
 * Transcribes a speech-audio file chunk by chunk. Long silences are left out
 * first (see silence.ts) and the timestamps mapped back to the original, so a
 * forgotten microphone costs neither API minutes nor transcript noise.
 * `beforeRequest` runs before every external call and throws when the job
 * lost its lease or the meeting's AI policy no longer allows the call.
 */
export async function transcribeAudio(input: {
  file: string;
  durationMs: number;
  language: string;
  signal: AbortSignal;
  beforeRequest: () => void;
}): Promise<TranscriptionResult> {
  const fake = fakeAiEnabled();
  const plan = fake
    ? { ranges: null, chunks: planChunks(input.durationMs, [], MAX_CHUNK_MS), skippedMs: 0 }
    : planTranscription(input.durationMs, await detectSilences(input.file, 700, input.durationMs, input.signal), MAX_CHUNK_MS);
  if (!plan.chunks.length) return { engine: "silence", model: "", segments: [], skippedMs: plan.skippedMs, detectedLanguage: null };
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "meeting-transcribe-"));
  try {
    let source = input.file;
    if (plan.ranges) {
      source = path.join(workDir, "compact.ogg");
      await keepAudioRanges(input.file, source, plan.ranges, input.durationMs, input.signal);
    }
    const chunks = plan.chunks;
    const segments: KeyedSegment[] = [];
    const knownSpeakers: KnownSpeaker[] = [];
    const languages = new Map<string, number>();
    let model = "";
    for (const [index, chunk] of chunks.entries()) {
      input.beforeRequest();
      let result: ChunkResult;
      if (fake) result = fakeChunk(index);
      else {
        const chunkFile = chunks.length === 1 ? source : path.join(workDir, `chunk-${index}.ogg`);
        // The last chunk runs to the end of the file, whatever its exact length after re-encoding.
        const cutMs = index === chunks.length - 1 ? chunk.durationMs + 60_000 : chunk.durationMs;
        if (chunks.length > 1) await cutAudio(source, chunkFile, chunk.startMs, cutMs, input.signal);
        result = await transcribeChunkWithOpenAI({ file: chunkFile, language: input.language, knownSpeakers, signal: input.signal });
        if (chunkFile !== source) await fs.rm(chunkFile, { force: true });
      }
      model = result.model;
      if (result.language) languages.set(result.language, (languages.get(result.language) ?? 0) + chunk.durationMs);
      const keyed = keySegments(index, chunk, result.segments, knownSpeakers.map((speaker) => speaker.name));
      segments.push(...keyed);
      if (index === 0 && chunks.length > 1 && !fake) {
        // Clips of the first chunk's speakers keep their names stable later on.
        for (const clip of referenceClips(keyed)) {
          const clipFile = path.join(workDir, `${clip.name}.wav`);
          await cutWavClip(source, clipFile, clip.startMs, clip.durationMs, input.signal);
          knownSpeakers.push({ name: clip.name, dataUrl: `data:audio/wav;base64,${(await fs.readFile(clipFile)).toString("base64")}` });
          await fs.rm(clipFile, { force: true });
        }
      }
    }
    const detectedLanguage = [...languages.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return {
      engine: fake ? "fake" : "openai",
      model,
      segments: plan.ranges ? segmentsToOriginal(plan.ranges, segments) : segments,
      skippedMs: plan.skippedMs,
      detectedLanguage,
    };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}
