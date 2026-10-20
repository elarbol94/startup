// Progress of a running meeting job: written by the worker onto the job row,
// turned into bar values when the meeting page is rendered. Pure, no I/O.
import { z } from "zod";

/** Top-level keys of the protocol JSON, in the order the strict schema makes the model write them. */
export const protocolSections = ["summary", "agendaItems", "decisions", "actionItems", "openQuestions"] as const;
export type ProtocolSection = (typeof protocolSections)[number];

const time = z.number().int().nonnegative();
const count = z.number().int().nonnegative();

export const jobProgressSchema = z.discriminatedUnion("step", [
  /** Claimed, no finer progress reported yet (e.g. ffmpeg conversion). */
  z.object({ step: z.literal("started"), at: time }),
  /** Finding silences and cutting them out before transcription. */
  z.object({ step: z.literal("preparing"), at: time }),
  /** Part `part` (1-based) of `parts` is at OpenAI; `doneMs` of `totalMs` audio is transcribed. */
  z.object({
    step: z.literal("transcribing"), part: count, parts: count, doneMs: count, partMs: count, totalMs: count,
    startedAt: time, partStartedAt: time,
  }),
  /** The transcript is sent; the model has not written any output yet. */
  z.object({ step: z.literal("analysing"), at: time }),
  /** The model is writing `protocolSections[section]`. */
  z.object({ step: z.literal("writing"), section: z.number().int().min(0).max(protocolSections.length - 1), at: time }),
]);
export type JobProgress = z.infer<typeof jobProgressSchema>;

export type JobProgressView = {
  step: JobProgress["step"];
  /** 0–1, or null when there is no measure (shown as an indeterminate bar). */
  fraction: number | null;
  /** Time spent in the current step. */
  elapsedMs: number;
  part?: number;
  parts?: number;
  doneMs?: number;
  totalMs?: number;
  /** Only once finished parts give a speed to extrapolate from. */
  remainingMs?: number | null;
  section?: ProtocolSection;
};

export function parseJobProgress(raw: string | null): JobProgress | null {
  if (!raw) return null;
  try {
    const parsed = jobProgressSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** A running part never shows as more than this share done before OpenAI answers. */
const PART_ESTIMATE_CAP = 0.9;

export function jobProgressView(progress: JobProgress, now: number): JobProgressView {
  switch (progress.step) {
    case "started":
    case "preparing":
    case "analysing":
      return { step: progress.step, fraction: null, elapsedMs: Math.max(0, now - progress.at) };
    case "writing":
      // Being in a section counts as started, so the bar never sits at zero.
      return {
        step: "writing",
        fraction: (progress.section + 1) / (protocolSections.length + 1),
        elapsedMs: Math.max(0, now - progress.at),
        section: protocolSections[progress.section],
      };
    case "transcribing": {
      const { doneMs, partMs, totalMs, startedAt, partStartedAt } = progress;
      // Wall-clock time per audio millisecond, measured over the finished parts.
      const rate = doneMs > 0 && partStartedAt > startedAt ? (partStartedAt - startedAt) / doneMs : null;
      const inPart = rate ? Math.min(partMs * PART_ESTIMATE_CAP, Math.max(0, now - partStartedAt) / rate) : 0;
      const total = Math.max(1, totalMs);
      return {
        step: "transcribing",
        fraction: Math.min(1, (doneMs + inPart) / total),
        elapsedMs: Math.max(0, now - startedAt),
        part: progress.part,
        parts: progress.parts,
        doneMs,
        totalMs,
        remainingMs: rate ? Math.max(0, Math.round((totalMs - doneMs - inPart) * rate)) : null,
      };
    }
  }
}

const sectionKey = (section: ProtocolSection) => new RegExp(`(?<!\\\\)"${section}"\\s*:`);

/**
 * The section the streamed protocol JSON has reached. Only moves forward, so
 * the nested `summary` of agenda items cannot send it back; a key inside a
 * string value is escaped (`\"`) and never matches.
 */
export function protocolSectionReached(text: string, current: number) {
  let reached = current;
  for (let index = current + 1; index < protocolSections.length; index++) {
    if (sectionKey(protocolSections[index]).test(text)) reached = index;
  }
  return reached;
}
