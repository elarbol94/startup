import type { PresentationElement } from "./presentation";
import type { DocumentHeadingStructure } from "./document-sections";

/**
 * Link from a presentation element to a document section. The links were
 * removed with the old wiki-page editor; stored presentations may still carry
 * them, so the shape stays for parsing and they are stripped from every copy
 * that leaves the editor.
 */
export type PresentationSource = { pageId: string; sectionId: string; reviewedFingerprint?: string; syncHeading?: boolean; syncSubsections?: boolean; knownSectionIds?: string[]; approvedStructure?: DocumentHeadingStructure };

export function withoutPresentationSources<T extends { elements: PresentationElement[] }>(snapshot: T): T {
  return { ...snapshot, elements: snapshot.elements.map((element) => {
    const copy = { ...element };
    delete copy.source;
    return copy;
  }) };
}
