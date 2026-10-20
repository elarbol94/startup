import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { jobProgressView, parseJobProgress, protocolSectionReached } from "./job-progress";
import { readResponseStream } from "./processing/protocol-ai";

const MIN = 60_000;

describe("job progress view", () => {
  it("shows the first part without an estimate", () => {
    const view = jobProgressView({
      step: "transcribing", part: 1, parts: 6, doneMs: 0, partMs: 20 * MIN, totalMs: 118 * MIN, startedAt: 0, partStartedAt: 0,
    }, 3 * MIN);
    expect(view.fraction).toBe(0);
    expect(view.remainingMs).toBeNull();
    expect(view.elapsedMs).toBe(3 * MIN);
  });

  it("extrapolates from finished parts and never claims a running part as done", () => {
    // Two 20-minute parts took 4 minutes: 0.1 ms of work per ms of audio.
    const progress = {
      step: "transcribing" as const, part: 3, parts: 6, doneMs: 40 * MIN, partMs: 20 * MIN, totalMs: 120 * MIN,
      startedAt: 0, partStartedAt: 4 * MIN,
    };
    const halfway = jobProgressView(progress, 5 * MIN);
    expect(halfway.fraction).toBeCloseTo(50 / 120);
    expect(halfway.remainingMs).toBe(7 * MIN);
    const late = jobProgressView(progress, 60 * MIN);
    expect(late.fraction).toBeCloseTo((40 + 18) / 120);
  });

  it("counts protocol sections and leaves the analysing step indeterminate", () => {
    expect(jobProgressView({ step: "analysing", at: 0 }, 1000)).toMatchObject({ fraction: null, elapsedMs: 1000 });
    expect(jobProgressView({ step: "writing", section: 2, at: 0 }, 0)).toMatchObject({ fraction: 3 / 6, section: "decisions" });
  });

  it("ignores unreadable stored progress", () => {
    expect(parseJobProgress(null)).toBeNull();
    expect(parseJobProgress("{")).toBeNull();
    expect(parseJobProgress('{"step":"warp"}')).toBeNull();
    expect(parseJobProgress('{"step":"preparing","at":5}')).toEqual({ step: "preparing", at: 5 });
  });
});

describe("protocol section detection", () => {
  it("moves forward through the top-level keys only", () => {
    expect(protocolSectionReached('{"summary":"Kurz', -1)).toBe(0);
    expect(protocolSectionReached('{"summary":"x","agendaItems":[{"key":"a1","title":"T","summary":"', 0)).toBe(1);
    // The nested summary of an agenda item must not move it back.
    expect(protocolSectionReached('"summary":"', 1)).toBe(1);
    expect(protocolSectionReached('],"decisions":[],"actionItems":[', 1)).toBe(3);
  });

  it("does not react to a key quoted inside a string value", () => {
    expect(protocolSectionReached('{"summary":"Wir sagten \\"decisions\\": keine', 0)).toBe(0);
  });
});

function sse(...parts: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    },
  });
}
const event = (data: object) => `event: x\r\ndata: ${JSON.stringify(data)}\r\n\r\n`;

describe("streamed protocol response", () => {
  it("collects deltas across chunk boundaries and prefers the final output", async () => {
    const seen: string[] = [];
    const whole = event({ type: "response.output_text.delta", delta: '{"summary":' }) + event({ type: "response.output_text.delta", delta: '"x"}' })
      + event({ type: "response.completed", response: { output: [{ type: "message", content: [{ type: "output_text", text: '{"summary":"x"}' }] }] } });
    const cut = Math.floor(whole.length / 2);
    const text = await readResponseStream(sse(whole.slice(0, cut), whole.slice(cut)), (value) => seen.push(value));
    expect(text).toBe('{"summary":"x"}');
    expect(seen).toEqual(['{"summary":', '{"summary":"x"}']);
  });

  it("fails clearly when the model stops early", async () => {
    await expect(readResponseStream(sse(event({ type: "response.incomplete", response: { incomplete_details: { reason: "max_output_tokens" } } })), () => {}))
      .rejects.toThrow("max_output_tokens");
  });
});
