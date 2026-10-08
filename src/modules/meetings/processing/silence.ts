// Pure helpers for skipping long silences before transcription. The audio
// sent to OpenAI is a "compacted" copy that only holds the kept ranges; these
// functions map times between that copy and the original timeline. No I/O,
// so they are unit-tested directly.

import { planChunks, type AudioChunk } from "./chunks";

export type TimeRange = { startMs: number; endMs: number };

export type SpeechRangeOptions = {
  /** Only silences at least this long are removed. */
  minGapMs: number;
  /** Silence kept on each side of a removed stretch, so no word is clipped. */
  padMs: number;
  /**
   * Upper bound of kept ranges. Each becomes one term of an `aselect`
   * expression, and ffmpeg's expression parser gives up at about 100 terms
   * ("Error while parsing expression", checked with ffmpeg 5.1).
   */
  maxRanges: number;
};

export const SILENCE_SKIP: SpeechRangeOptions = { minGapMs: 10_000, padMs: 1_000, maxRanges: 80 };

/** Removing less than this is not worth re-encoding the audio. */
export const MIN_SKIPPED_MS = 30_000;

/** Silences reported by ffmpeg's `silencedetect`; an unterminated one runs to the end. */
export function parseSilenceDetect(output: string, durationMs = Number.POSITIVE_INFINITY): TimeRange[] {
  const silences: TimeRange[] = [];
  let start: number | null = null;
  for (const line of output.split(/\r?\n/)) {
    const startMatch = /silence_start: (-?[\d.]+)/.exec(line);
    if (startMatch) start = Math.max(0, Number(startMatch[1]) * 1000);
    const endMatch = /silence_end: ([\d.]+)/.exec(line);
    if (endMatch && start !== null) {
      silences.push({ startMs: Math.round(start), endMs: Math.round(Number(endMatch[1]) * 1000) });
      start = null;
    }
  }
  if (start !== null && Number.isFinite(durationMs)) silences.push({ startMs: Math.round(start), endMs: durationMs });
  return silences;
}

/** Midpoints of silences: good places to cut a recording into chunks. */
export const silenceMidpoints = (silences: TimeRange[]) => silences.map((silence) => Math.round((silence.startMs + silence.endMs) / 2));

/**
 * The ranges of a recording worth transcribing: everything except silences of
 * at least `minGapMs`, keeping `padMs` of silence next to speech. Returns an
 * empty list when the whole recording is silent.
 */
export function speechRanges(durationMs: number, silences: TimeRange[], options: SpeechRangeOptions = SILENCE_SKIP): TimeRange[] {
  if (durationMs <= 0) return [];
  const gaps = silences
    .map((silence) => ({
      // At the very start or end of the recording no padding is needed.
      startMs: silence.startMs <= 0 ? 0 : silence.startMs + options.padMs,
      endMs: silence.endMs >= durationMs ? durationMs : silence.endMs - options.padMs,
      length: silence.endMs - silence.startMs,
    }))
    .filter((gap) => gap.length >= options.minGapMs && gap.endMs > gap.startMs)
    .map((gap) => ({ startMs: Math.max(0, gap.startMs), endMs: Math.min(durationMs, gap.endMs) }))
    .filter((gap) => gap.endMs > gap.startMs);
  // Too many ranges: only the longest gaps are removed.
  const kept = gaps.sort((a, b) => (b.endMs - b.startMs) - (a.endMs - a.startMs)).slice(0, Math.max(0, options.maxRanges - 1))
    .sort((a, b) => a.startMs - b.startMs);
  const ranges: TimeRange[] = [];
  let cursor = 0;
  for (const gap of kept) {
    if (gap.startMs < cursor) {
      cursor = Math.max(cursor, gap.endMs);
      continue;
    }
    if (gap.startMs > cursor) ranges.push({ startMs: cursor, endMs: gap.startMs });
    cursor = gap.endMs;
  }
  if (cursor < durationMs) ranges.push({ startMs: cursor, endMs: durationMs });
  return ranges;
}

export const totalMs = (ranges: TimeRange[]) => ranges.reduce((sum, range) => sum + range.endMs - range.startMs, 0);

/**
 * Maps a time of the compacted audio back to the original recording. A time
 * exactly on the border of two ranges belongs to the later range, unless
 * `bias` is "end" (the end of a segment stays in the range it was spoken in).
 */
export function toOriginalMs(ranges: TimeRange[], compactMs: number, bias: "start" | "end" = "start"): number {
  if (!ranges.length) return compactMs;
  let offset = 0;
  for (const [index, range] of ranges.entries()) {
    const length = range.endMs - range.startMs;
    const inside = bias === "end" ? compactMs <= offset + length : compactMs < offset + length;
    if (inside || index === ranges.length - 1) return range.startMs + Math.max(0, compactMs - offset);
    offset += length;
  }
  return compactMs;
}

/** Maps an original time into the compacted audio; times in a removed stretch land on the next kept range. */
export function toCompactMs(ranges: TimeRange[], originalMs: number): number {
  let offset = 0;
  for (const range of ranges) {
    if (originalMs < range.startMs) return offset;
    if (originalMs < range.endMs) return offset + originalMs - range.startMs;
    offset += range.endMs - range.startMs;
  }
  return offset;
}

/** Puts transcript segments of the compacted audio back on the original timeline. */
export function segmentsToOriginal<T extends { startMs: number; endMs: number }>(ranges: TimeRange[], segments: T[]): T[] {
  return segments.map((segment) => {
    const startMs = toOriginalMs(ranges, segment.startMs);
    return { ...segment, startMs, endMs: Math.max(startMs, toOriginalMs(ranges, segment.endMs, "end")) };
  });
}

/** ffmpeg audio filter keeping only `ranges`, with gapless timestamps. */
export function keepRangesFilter(ranges: TimeRange[]) {
  const terms = ranges.map((range) => `between(t,${(range.startMs / 1000).toFixed(3)},${(range.endMs / 1000).toFixed(3)})`);
  return `aselect='${terms.join("+")}',asetpts=N/SR/TB`;
}

export type TranscriptionPlan = {
  /** Kept ranges of the original, or null when the original is sent as is. */
  ranges: TimeRange[] | null;
  /** Chunks on the timeline of the audio actually sent (compacted or original). */
  chunks: AudioChunk[];
  skippedMs: number;
};

/**
 * Decides what is sent for transcription: nothing for a silent recording, a
 * compacted copy when long silences add up, otherwise the original.
 */
export function planTranscription(durationMs: number, silences: TimeRange[], maxChunkMs: number): TranscriptionPlan {
  const midpoints = silenceMidpoints(silences);
  const ranges = speechRanges(durationMs, silences);
  const keptMs = totalMs(ranges);
  if (durationMs > 0 && !ranges.length) return { ranges: [], chunks: [], skippedMs: durationMs };
  if (durationMs <= 0 || durationMs - keptMs < MIN_SKIPPED_MS) {
    return { ranges: null, chunks: planChunks(durationMs, midpoints, maxChunkMs), skippedMs: 0 };
  }
  const compactPoints = [...new Set(midpoints.map((point) => toCompactMs(ranges, point)))];
  return { ranges, chunks: planChunks(keptMs, compactPoints, maxChunkMs), skippedMs: durationMs - keptMs };
}
