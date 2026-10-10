/**
 * Section logic for "focus on section" in office documents. The workspace
 * plugin reports the document's headings (paragraph index in document order,
 * outline level 1–9 including style-defined levels, text) and the cursor's
 * paragraph; everything else is decided here so it stays testable.
 *
 * A section is a heading down to the next heading of the same or a higher
 * level. Text before the first heading is the pseudo-section "start of
 * document" (level 0, no heading).
 */
export type OutlineHeading = { index: number; level: number; title: string };

export type OutlineReason = "focus" | "previous" | "next";

export type OfficeSection = {
  /** Paragraph index of the heading; null for the start of the document. */
  headingIndex: number | null;
  level: number;
  title: string | null;
  /** Heading index of the previous/next section of the same level, if any. */
  previous: number | null;
  next: number | null;
};

/** The section containing paragraph `cursor`, or null if the cursor is unknown. */
export function sectionAt(headings: OutlineHeading[], cursor: number): OfficeSection | null {
  if (!Number.isInteger(cursor) || cursor < 0) return null;
  let position = -1;
  for (let i = 0; i < headings.length && headings[i].index <= cursor; i++) position = i;
  if (position < 0) {
    return { headingIndex: null, level: 0, title: null, previous: null, next: headings[0]?.index ?? null };
  }
  const heading = headings[position];
  let previous: number | null = null;
  for (let i = position - 1; i >= 0; i--) if (headings[i].level === heading.level) { previous = headings[i].index; break; }
  let next: number | null = null;
  for (let i = position + 1; i < headings.length; i++) if (headings[i].level === heading.level) { next = headings[i].index; break; }
  return { headingIndex: heading.index, level: heading.level, title: heading.title, previous, next };
}

/**
 * Where to move for an outline the plugin just read: the current section's
 * heading ("focus") or the previous/next section of the same level. Returns
 * null when there is nowhere to go.
 */
export function resolveSectionTarget(headings: OutlineHeading[], cursor: number, reason: OutlineReason): { index: number; section: OfficeSection } | null {
  const current = sectionAt(headings, cursor);
  if (!current) return null;
  if (reason === "focus") return { index: current.headingIndex ?? 0, section: current };
  const index = reason === "previous" ? current.previous : current.next;
  if (index === null) return null;
  const section = sectionAt(headings, index);
  return section ? { index, section } : null;
}
