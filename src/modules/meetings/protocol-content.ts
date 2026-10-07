import { z } from "zod";

// The stored protocol format, shared by the AI output, the editor and the
// approval/action-item code. `evidence` holds session segment ids.

const key = z.string().trim().min(1).max(40);
const text = (max: number) => z.string().trim().max(max);
const evidence = z.array(z.string().min(1).max(64)).max(20).default([]);

export const protocolContentSchema = z.object({
  summary: text(8000).default(""),
  agendaItems: z.array(z.object({ key, title: text(300).min(1), summary: text(4000).default(""), evidence })).max(60).default([]),
  decisions: z.array(z.object({ key, text: text(2000).min(1), evidence })).max(100).default([]),
  actionItems: z.array(z.object({
    itemKey: key,
    text: text(1000).min(1),
    assigneeUserId: z.string().max(64).nullable().default(null),
    dueDate: z.iso.date().nullable().default(null),
    evidence,
  })).max(100).default([]),
  openQuestions: z.array(z.object({ key, text: text(2000).min(1), evidence })).max(100).default([]),
});

export type ProtocolContent = z.infer<typeof protocolContentSchema>;
export type ProtocolActionItem = ProtocolContent["actionItems"][number];

export const emptyProtocol = (): ProtocolContent => ({ summary: "", agendaItems: [], decisions: [], actionItems: [], openQuestions: [] });

export function parseProtocolContent(json: string): ProtocolContent {
  const parsed = protocolContentSchema.safeParse(JSON.parse(json));
  return parsed.success ? parsed.data : emptyProtocol();
}

/** Every evidence id the protocol cites. */
export function citedSegmentIds(content: ProtocolContent) {
  return [
    ...content.agendaItems, ...content.decisions, ...content.actionItems, ...content.openQuestions,
  ].flatMap((item) => item.evidence);
}

/**
 * Keys must be unique per list, so action items can be decided by key and a
 * later version can refer to the same item.
 */
export function protocolKeysAreUnique(content: ProtocolContent) {
  const unique = (keys: string[]) => new Set(keys).size === keys.length;
  return unique(content.agendaItems.map((item) => item.key))
    && unique(content.decisions.map((item) => item.key))
    && unique(content.actionItems.map((item) => item.itemKey))
    && unique(content.openQuestions.map((item) => item.key));
}

/** Drops evidence that does not point at a segment of the pinned transcript. */
export function keepKnownEvidence(content: ProtocolContent, segmentIds: Set<string>): ProtocolContent {
  const clean = <T extends { evidence: string[] }>(items: T[]) => items.map((item) => ({ ...item, evidence: item.evidence.filter((id) => segmentIds.has(id)) }));
  return {
    ...content,
    agendaItems: clean(content.agendaItems),
    decisions: clean(content.decisions),
    actionItems: clean(content.actionItems),
    openQuestions: clean(content.openQuestions),
  };
}
