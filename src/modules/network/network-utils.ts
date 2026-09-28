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

/** A previously used value (tag, "met at" context) with how often it was used. */
export type Suggestion = { value: string; count: number };

/** Edit distance, for "did you mean" on small typos. */
export function editDistance(a: string, b: string) {
  if (a === b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

/**
 * Orders known values for a typed query: exact match, then prefix, then a
 * word starting with the query, then anywhere; within each, the incoming
 * order (most used or most recent first) is kept. With nothing typed every
 * value is offered. When nothing contains the query, near-misses ("Förderug")
 * come back as `closest`, and `exact` names the stored spelling of a match
 * that differs only in case or accents.
 */
export function rankSuggestions(
  suggestions: readonly Suggestion[],
  query: string,
  options: { exclude?: readonly string[] } = {},
) {
  const excluded = new Set((options.exclude ?? []).map(normalizeText));
  const available = suggestions.filter((suggestion) => !excluded.has(normalizeText(suggestion.value)));
  const needle = normalizeText(query);
  if (!needle) return { matches: available, closest: [] as Suggestion[], exact: null as Suggestion | null };

  const scored = available.flatMap((suggestion, order) => {
    const haystack = normalizeText(suggestion.value);
    const score = haystack === needle ? 0
      : haystack.startsWith(needle) ? 1
      : haystack.split(/[\s\-/,.]+/).some((word) => word.startsWith(needle)) ? 2
      : haystack.includes(needle) ? 3
      : null;
    return score === null ? [] : [{ suggestion, score, order }];
  });
  scored.sort((a, b) => a.score - b.score || a.order - b.order);
  const matches = scored.map((entry) => entry.suggestion);
  const exact = scored[0]?.score === 0 ? scored[0].suggestion : null;

  let closest: Suggestion[] = [];
  if (!matches.length && needle.length >= 3) {
    const tolerance = needle.length <= 5 ? 1 : 2;
    closest = available
      .map((suggestion) => {
        const haystack = normalizeText(suggestion.value);
        const words = [haystack, ...haystack.split(" ")];
        // Compare with whole words and with the start of the value at the typed length.
        const distance = Math.min(...words.map((word) => editDistance(needle, word)), editDistance(needle, haystack.slice(0, needle.length)));
        return { suggestion, distance };
      })
      .filter((entry) => entry.distance <= tolerance)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3)
      .map((entry) => entry.suggestion);
  }
  return { matches, closest, exact };
}

export const MAX_SIMILAR_CONTACTS = 5;
/** Shorter names are too ambiguous for fuzzy matching; they only match exactly. */
const MIN_FUZZY_NAME_LENGTH = 4;

export type SimilarContact<T> = { contact: T; exact: boolean };

const nameTokens = (normalized: string) => normalized.split(" ").filter(Boolean).sort().join(" ");

/**
 * Contacts whose name matches a typed one, for duplicate hints: exact matches
 * (ignoring case, accents and spacing) first, then near-misses — the same
 * words in a different order ("Huber Maria"), or one typo for names under 8
 * characters and two for longer ones. Names under 4 characters only match
 * exactly. At most five, closest first; ties keep the incoming order.
 */
export function findSimilarContacts<T extends { name: string }>(name: string, contacts: readonly T[]): SimilarContact<T>[] {
  const key = normalizeText(name);
  if (!key) return [];
  const fuzzy = key.length >= MIN_FUZZY_NAME_LENGTH;
  const tolerance = key.length < 8 ? 1 : 2;
  const tokens = nameTokens(key);
  const scored = contacts.flatMap((contact, order) => {
    const candidate = normalizeText(contact.name);
    if (candidate === key) return [{ contact, exact: true, score: 0, order }];
    if (!fuzzy || !candidate) return [];
    if (nameTokens(candidate) === tokens) return [{ contact, exact: false, score: 1, order }];
    // The distance is at least the length difference, so skip the obvious misses.
    if (Math.abs(candidate.length - key.length) > tolerance) return [];
    const distance = editDistance(key, candidate);
    return distance <= tolerance ? [{ contact, exact: false, score: 1 + distance, order }] : [];
  });
  scored.sort((a, b) => a.score - b.score || a.order - b.order);
  return scored.slice(0, MAX_SIMILAR_CONTACTS).map(({ contact, exact }) => ({ contact, exact }));
}
