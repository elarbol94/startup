import type { PresentationElement } from "./presentation";

export function presentationObjectTools(selection: PresentationElement[]) {
  const single = selection.length === 1 ? selection[0] : undefined;
  const isLine = (element: PresentationElement) => element.type === "shape" && (Boolean(element.content.connection) || element.content.shape === "line" || element.content.shape === "arrow");
  return {
    appearance: Boolean(single),
    content: Boolean(single && !["shape", "frame"].includes(single.type)),
    structure: selection.length > 0,
    animation: Boolean(single),
    connect: selection.length > 0 && selection.length <= 2 && !selection.some(isLine),
    arrange: selection.length > 1,
  };
}
