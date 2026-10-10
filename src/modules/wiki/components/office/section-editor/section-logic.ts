/**
 * Pure logic for "Abschnitt separat bearbeiten" (edit a section in a separate
 * editor). The workspace plugin reports the document's top-level blocks; the
 * page decides here which blocks form the section, how the lock tag looks and
 * which leftover locks are stale. See docs/office-documents.md.
 */

/** One top-level block of the document as the workspace plugin reports it. */
export type OutlineBlock = {
  /** Outline level 1–9 for a heading paragraph (style levels included), else 0. */
  level: number;
  title?: string | null;
  /** Tag of a block content control, reported only for section-edit locks. */
  tag?: string | null;
};

export type SectionRange = {
  /** First block (inclusive) and end (exclusive) in top-level block indexes. */
  start: number;
  end: number;
  /** Heading level; 0 for the start of the document (text above the first heading). */
  level: number;
  title: string | null;
};

export type SectionRangeResult = { ok: true; range: SectionRange } | { ok: false; reason: "noPosition" | "locked" };

const isHeading = (block: OutlineBlock | undefined) => Boolean(block && block.level >= 1 && block.level <= 9);

/**
 * The section around block `cursor`: its heading down to the next heading of
 * the same or a higher level. Above the first heading, the section is the
 * start of the document down to the first heading. A section that already
 * contains a section-edit lock is refused.
 */
export function sectionRange(blocks: OutlineBlock[], cursor: number): SectionRangeResult {
  if (!Number.isInteger(cursor) || cursor < 0 || cursor >= blocks.length) return { ok: false, reason: "noPosition" };
  let heading = -1;
  for (let i = cursor; i >= 0; i--) if (isHeading(blocks[i])) { heading = i; break; }
  const start = Math.max(heading, 0);
  const level = heading < 0 ? 0 : blocks[heading].level;
  let end = blocks.length;
  for (let i = start + 1; i < blocks.length; i++) {
    if (isHeading(blocks[i]) && (level === 0 || blocks[i].level <= level)) { end = i; break; }
  }
  for (let i = start; i < end; i++) if (parseSectionEditTag(blocks[i].tag)) return { ok: false, reason: "locked" };
  return { ok: true, range: { start, end, level, title: heading < 0 ? null : blocks[heading].title ?? null } };
}

/** Content-control tag of the locked section in the main document. */
export const SECTION_EDIT_TAG_PREFIX = "mp:section-edit:";

export type SectionEditLock = { id: string; user: string; at: number };

const LOCK_ID = /^[0-9a-zA-Z-]{8,64}$/;

/** Whether a value can be a section-edit lock id (e.g. the section tab's `?edit=`). */
export function isSectionLockId(value: unknown): value is string {
  return typeof value === "string" && LOCK_ID.test(value);
}

export function sectionEditTag(lock: SectionEditLock) {
  return SECTION_EDIT_TAG_PREFIX + JSON.stringify({ id: lock.id, user: lock.user, at: lock.at });
}

export function parseSectionEditTag(tag: unknown): SectionEditLock | null {
  if (typeof tag !== "string" || !tag.startsWith(SECTION_EDIT_TAG_PREFIX)) return null;
  let data: unknown;
  try { data = JSON.parse(tag.slice(SECTION_EDIT_TAG_PREFIX.length)); } catch { return null; }
  if (!data || typeof data !== "object") return null;
  const { id, user, at } = data as Record<string, unknown>;
  if (!isSectionLockId(id)) return null;
  if (typeof user !== "string" || !user || user.length > 200) return null;
  if (typeof at !== "number" || !Number.isFinite(at)) return null;
  return { id, user, at };
}

/** Locks older than this are released even if their owner is still connected. */
export const SECTION_EDIT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Which section-edit locks found when the main document opens are leftovers
 * (closed tab, crash) and may be unwrapped, keeping their content:
 * - a lock whose section editor answers in this browser (any tab) is live;
 * - a lock older than a day is stale;
 * - our own lock without a live editor in this browser is stale;
 * - another user's lock is stale once that user is no longer connected to the
 *   document (the document server's user list from the save callbacks);
 *   without that list it is kept.
 */
export function staleSectionEdits(locks: SectionEditLock[], context: {
  selfId: string;
  liveIds: ReadonlySet<string>;
  connectedUsers: readonly string[] | null;
  now: number;
}): SectionEditLock[] {
  return locks.filter((lock) => {
    if (context.liveIds.has(lock.id)) return false;
    if (context.now - lock.at > SECTION_EDIT_MAX_AGE_MS) return true;
    if (lock.user === context.selfId) return true;
    if (!context.connectedUsers) return false;
    return !context.connectedUsers.includes(lock.user);
  });
}
