import { isPresentationElementLocked, type PresentationElement } from "./presentation";

const formatKeys: Record<PresentationElement["type"], readonly string[]> = {
  text: ["font", "fontSize", "bold", "italic", "underline", "align", "color", "list", "padding", "autoFit"],
  frame: ["shape", "color"],
  shape: ["fill", "stroke", "strokeWidth", "opacity"],
  image: ["fit", "mask"],
  chart: ["color"], icon: ["color"], audio: [], video: [],
};
export type PresentationFormat = { type: PresentationElement["type"]; background?: string; content: Record<string, unknown> };
export function copyPresentationFormat(element: PresentationElement): PresentationFormat {
  const content = element.content as Record<string, unknown>;
  return { type: element.type, background: element.background,
    content: Object.fromEntries(formatKeys[element.type].map(key => [key, structuredClone(content[key])])) };
}
/** Apply only appearance fields. Content, geometry, hierarchy and links stay with the target. */
export function pastePresentationFormat(elements: PresentationElement[], ids: Set<string>, format: PresentationFormat): PresentationElement[] {
  let changed = false;
  const next = elements.map(element => {
    if (!ids.has(element.id) || element.type !== format.type || isPresentationElementLocked(elements, element.id)) return element;
    const content = { ...element.content, ...structuredClone(format.content) };
    if (element.type === "text" && element.content.runs) {
      // Remove local span overrides so the pasted object formatting is visible, keeping text and links.
      Object.assign(content, { runs: element.content.runs.map(({ text, href }) => ({ text, href })) });
    }
    const result = { ...element, background: format.background, content } as PresentationElement;
    if (JSON.stringify(result) === JSON.stringify(element)) return element;
    changed = true; return result;
  });
  return changed ? next : elements;
}
