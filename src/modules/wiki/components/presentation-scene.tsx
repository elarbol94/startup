import { PresentationContent } from "./presentation-content";
import { presentationCameraBounds, presentationCameraStep, presentationHiddenIds, stepTarget, unionBounds, type PresentationSnapshot } from "../lib/presentation";

export function PresentationScene({ presentation, index, mediaUrl, interactive = false, padding = 0.12 }: {
  presentation: PresentationSnapshot; index: number; mediaUrl?: (id: string) => string; interactive?: boolean; padding?: number;
}) {
  const step = presentationCameraStep(presentation.steps, index);
  const target = step ? stepTarget(step, presentation.elements) : null;
  const b = target ? presentationCameraBounds(target) : unionBounds(presentation.elements.map(presentationCameraBounds)) ?? { x: 0, y: 0, width: 960, height: 540 };
  const hidden = presentationHiddenIds(presentation.elements, presentation.steps, index);
  const view = { x: b.x - b.width * padding, y: b.y - b.height * padding, width: b.width * (1 + 2 * padding), height: b.height * (1 + 2 * padding) };
  // Only what the view can show: every stop in the frame rail draws a scene of its own.
  const visible = (element: PresentationSnapshot["elements"][number]) => {
    const box = presentationCameraBounds(element);
    return box.x < view.x + view.width && box.x + box.width > view.x && box.y < view.y + view.height && box.y + box.height > view.y;
  };
  const inView = presentation.elements.filter(visible);
  const ordered = [...inView.filter((element) => element.type === "frame"), ...inView.filter((element) => element.type !== "frame")];
  return <svg viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} width="100%" height="100%" role="img" aria-label={presentation.title} style={{ background: presentation.background || "#fff", color: "#172033" }}>
    {ordered.filter((element) => !hidden.has(element.id)).map((element) => <foreignObject key={element.id} x={element.x} y={element.y} width={element.width} height={element.height} overflow="visible" transform={`rotate(${element.rotation} ${element.x + element.width / 2} ${element.y + element.height / 2})`}>
      <div style={{ width: "100%", height: "100%", position: "relative", background: element.background || undefined }}><PresentationContent element={element} mediaUrl={mediaUrl} interactive={interactive} /></div>
    </foreignObject>)}
  </svg>;
}
