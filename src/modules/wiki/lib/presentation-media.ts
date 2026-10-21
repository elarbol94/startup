// Every file a presentation element uses: an image, video or audio element's own attachment,
// and a shape's picture fill. Saving, sharing, copying, export and import all walk media through
// these two helpers, so a picture fill is never left out of access checks or copies.
import type { PresentationElement } from "./presentation-model";

export type PresentationMediaRef = { kind: "image" | "video" | "audio"; attachmentId: string };

export function elementMedia(element: PresentationElement): PresentationMediaRef[] {
  if (element.type === "image" || element.type === "video" || element.type === "audio") return [{ kind: element.type, attachmentId: element.content.attachmentId }];
  if (element.type === "shape" && element.content.fillStyle?.type === "picture") return [{ kind: "image", attachmentId: element.content.fillStyle.attachmentId }];
  return [];
}

export const presentationMedia = (elements: PresentationElement[]) => elements.flatMap(elementMedia);

/** The element with each attachment id replaced by `map(id)`; ids it maps to themselves stay. */
export function mapElementMedia(element: PresentationElement, map: (id: string) => string): PresentationElement {
  if (element.type === "image" || element.type === "video" || element.type === "audio") return { ...element, content: { ...element.content, attachmentId: map(element.content.attachmentId) } } as PresentationElement;
  if (element.type === "shape" && element.content.fillStyle?.type === "picture") return { ...element, content: { ...element.content, fillStyle: { ...element.content.fillStyle, attachmentId: map(element.content.fillStyle.attachmentId) } } };
  return element;
}
