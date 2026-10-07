// Pure helpers for splitting long recordings and keeping speaker labels
// stable across chunks. No I/O, so they are unit-tested directly.

export type AudioChunk = { startMs: number; durationMs: number };
export type RawSegment = { startMs: number; endMs: number; speaker: string; text: string };
export type KeyedSegment = { startMs: number; endMs: number; speakerKey: string; text: string };

/**
 * Splits `durationMs` into chunks of at most `maxChunkMs`, cutting at the last
 * silence in the second half of each window so words are not cut in two.
 * Chunks never overlap, so no deduplication is needed.
 */
export function planChunks(durationMs: number, silencesMs: number[], maxChunkMs: number): AudioChunk[] {
  if (durationMs <= maxChunkMs) return [{ startMs: 0, durationMs }];
  const sorted = [...silencesMs].sort((a, b) => a - b);
  const chunks: AudioChunk[] = [];
  let start = 0;
  while (durationMs - start > maxChunkMs) {
    const limit = start + maxChunkMs;
    const cut = [...sorted].reverse().find((point) => point < limit && point > start + maxChunkMs / 2) ?? limit;
    chunks.push({ startMs: start, durationMs: cut - start });
    start = cut;
  }
  chunks.push({ startMs: start, durationMs: durationMs - start });
  return chunks;
}

export const MAX_KNOWN_SPEAKERS = 4;
export const knownSpeakerName = (index: number) => `SPK${index + 1}`;

/**
 * Turns chunk-local diarization labels into stable keys. In the first chunk
 * the first four speakers become SPK1–SPK4 (their clips are then sent as
 * known-speaker references with later chunks, so the API reuses those names).
 * Any other label stays chunk-scoped (`c2:B`) for the person mapping speakers.
 */
export function keySegments(chunkIndex: number, chunk: AudioChunk, segments: RawSegment[], knownNames: string[]) {
  const firstChunkNames = new Map<string, string>();
  const keyed: KeyedSegment[] = segments.map((segment) => {
    let speakerKey: string;
    if (knownNames.includes(segment.speaker)) speakerKey = segment.speaker;
    else if (chunkIndex === 0 && (firstChunkNames.has(segment.speaker) || firstChunkNames.size < MAX_KNOWN_SPEAKERS)) {
      if (!firstChunkNames.has(segment.speaker)) firstChunkNames.set(segment.speaker, knownSpeakerName(firstChunkNames.size));
      speakerKey = firstChunkNames.get(segment.speaker)!;
    } else speakerKey = `c${chunkIndex + 1}:${segment.speaker}`;
    return {
      startMs: chunk.startMs + Math.max(0, segment.startMs),
      endMs: chunk.startMs + Math.max(segment.startMs, segment.endMs),
      speakerKey,
      text: segment.text.trim(),
    };
  }).filter((segment) => segment.text);
  return keyed;
}

/** For each known speaker, the longest segment of the first chunk (clip source). */
export function referenceClips(segments: KeyedSegment[]) {
  const best = new Map<string, KeyedSegment>();
  for (const segment of segments) {
    if (!/^SPK\d$/.test(segment.speakerKey)) continue;
    const current = best.get(segment.speakerKey);
    if (!current || segment.endMs - segment.startMs > current.endMs - current.startMs) best.set(segment.speakerKey, segment);
  }
  return [...best.entries()]
    .filter(([, segment]) => segment.endMs - segment.startMs >= 2_000)
    .map(([name, segment]) => ({ name, startMs: segment.startMs, durationMs: Math.min(10_000, segment.endMs - segment.startMs) }));
}
