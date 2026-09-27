// Pure helpers shared by queries, actions and client components (no DB imports).
import type { LeadStatus } from "./constants";

export const MAX_TAGS_PER_CONTACT = 20;
export const MAX_TAG_LENGTH = 40;

/** Case- and accent-insensitive form used for tag uniqueness and search. */
export function normalizeText(value: string) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("de").trim().replace(/\s+/g, " ");
}

/** "Design, förderung,  design" → ["Design", "förderung"]: trimmed, de-duplicated, capped. */
export function parseTagInput(input: string | readonly string[]) {
  const parts = typeof input === "string" ? input.split(/[,;\n]/) : input;
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of parts) {
    const name = part.trim().replace(/^#/, "").replace(/\s+/g, " ").slice(0, MAX_TAG_LENGTH).trim();
    const key = normalizeText(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    tags.push(name);
    if (tags.length >= MAX_TAGS_PER_CONTACT) break;
  }
  return tags;
}

/** Every search word must appear somewhere in the given fields. */
export function matchesSearch(query: string, fields: readonly (string | null | undefined)[]) {
  const words = normalizeText(query).split(" ").filter(Boolean);
  if (!words.length) return true;
  const haystack = normalizeText(fields.filter(Boolean).join(" "));
  return words.every((word) => haystack.includes(word));
}

export function isLeadActive(status: LeadStatus) {
  return status === "open" || status === "asked";
}

export function isLeadOverdue(lead: { status: LeadStatus; dueOn: string | null }, today: string) {
  return isLeadActive(lead.status) && lead.dueOn !== null && lead.dueOn < today;
}

/** Active leads first; within a group, due dates ascending with undated ones last, then newest. */
export function compareLeads(
  a: { status: LeadStatus; dueOn: string | null; createdAt: Date },
  b: { status: LeadStatus; dueOn: string | null; createdAt: Date },
) {
  const active = Number(isLeadActive(b.status)) - Number(isLeadActive(a.status));
  if (active) return active;
  if (a.dueOn !== b.dueOn) {
    if (a.dueOn === null) return 1;
    if (b.dueOn === null) return -1;
    return a.dueOn < b.dueOn ? -1 : 1;
  }
  return b.createdAt.getTime() - a.createdAt.getTime();
}
