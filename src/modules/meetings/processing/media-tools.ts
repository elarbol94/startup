import "server-only";

import { execFile } from "node:child_process";
import { keepRangesFilter, parseSilenceDetect, type TimeRange } from "./silence";

/**
 * ffmpeg/ffprobe without a shell: fixed argument lists, local files only
 * (`-protocol_whitelist file`), no stdin, bounded run time and output, low
 * CPU priority so a long recording never starves the web server.
 */
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";

function run(command: string, args: string[], options: { timeoutMs: number; signal?: AbortSignal }) {
  const useNice = process.platform !== "win32" && process.env.MEETINGS_NICE !== "0";
  const [bin, argv] = useNice ? ["nice", ["-n", "10", command, ...args]] : [command, args];
  return new Promise<string>((resolve, reject) => {
    execFile(bin, argv, {
      encoding: "utf8",
      timeout: options.timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
      signal: options.signal,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      if (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          reject(new Error(`Required media tool "${command}" was not found. Install ffmpeg or set FFMPEG_PATH/FFPROBE_PATH.`));
          return;
        }
        reject(new Error(String(stderr || error.message).trim().slice(-2000)));
        return;
      }
      resolve(`${stdout}${stderr}`);
    });
  });
}

const inputArgs = (file: string) => ["-nostdin", "-hide_banner", "-protocol_whitelist", "file", "-i", file];

export type MediaProbe = { durationMs: number; hasAudio: boolean; hasVideo: boolean };

export async function probeMedia(file: string, signal?: AbortSignal): Promise<MediaProbe> {
  const output = await run(FFPROBE, [
    "-v", "error", "-protocol_whitelist", "file", "-print_format", "json",
    "-show_entries", "format=duration:stream=codec_type", file,
  ], { timeoutMs: 120_000, signal });
  const parsed = JSON.parse(output.slice(output.indexOf("{"))) as { format?: { duration?: string }; streams?: Array<{ codec_type?: string }> };
  const types = new Set((parsed.streams ?? []).map((stream) => stream.codec_type));
  return {
    durationMs: Math.max(0, Math.round(Number(parsed.format?.duration ?? 0) * 1000)),
    hasAudio: types.has("audio"),
    hasVideo: types.has("video"),
  };
}

/** Mono 16 kHz Opus: small, speech-quality audio for transcription and playback. */
export async function extractSpeechAudio(input: string, output: string, durationMs: number, signal?: AbortSignal) {
  await run(FFMPEG, [
    ...inputArgs(input), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libopus", "-b:a", "24k",
    "-application", "voip", "-fs", String(2 * 1024 * 1024 * 1024), "-y", output,
  ], { timeoutMs: Math.max(10 * 60_000, durationMs * 2), signal });
}

/** Copies a time range of an Opus file without re-encoding. */
export async function cutAudio(input: string, output: string, startMs: number, durationMs: number, signal?: AbortSignal) {
  await run(FFMPEG, [
    "-nostdin", "-hide_banner", "-protocol_whitelist", "file", "-ss", (startMs / 1000).toFixed(3), "-t", (durationMs / 1000).toFixed(3),
    "-i", input, "-c", "copy", "-y", output,
  ], { timeoutMs: 10 * 60_000, signal });
}

/** A short WAV clip, used as a known-speaker reference. */
export async function cutWavClip(input: string, output: string, startMs: number, durationMs: number, signal?: AbortSignal) {
  await run(FFMPEG, [
    "-nostdin", "-hide_banner", "-protocol_whitelist", "file", "-ss", (startMs / 1000).toFixed(3), "-t", (durationMs / 1000).toFixed(3),
    "-i", input, "-ac", "1", "-ar", "16000", "-y", output,
  ], { timeoutMs: 120_000, signal });
}

/** Silences of at least `minSilenceMs`, in milliseconds. */
export async function detectSilences(input: string, minSilenceMs: number, durationMs: number, signal?: AbortSignal): Promise<TimeRange[]> {
  const output = await run(FFMPEG, [
    ...inputArgs(input), "-af", `silencedetect=noise=-35dB:d=${(minSilenceMs / 1000).toFixed(2)}`, "-f", "null", "-",
  ], { timeoutMs: 30 * 60_000, signal });
  return parseSilenceDetect(output, durationMs || undefined);
}

/** Re-encodes only `ranges` of a speech-audio file into one gapless Opus file. */
export async function keepAudioRanges(input: string, output: string, ranges: TimeRange[], durationMs: number, signal?: AbortSignal) {
  await run(FFMPEG, [
    ...inputArgs(input), "-vn", "-af", keepRangesFilter(ranges), "-ac", "1", "-ar", "16000", "-c:a", "libopus", "-b:a", "24k",
    "-application", "voip", "-y", output,
  ], { timeoutMs: Math.max(10 * 60_000, durationMs * 2), signal });
}
