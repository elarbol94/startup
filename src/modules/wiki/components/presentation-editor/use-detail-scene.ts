// The editor's view into one scene: the overview, or one detail page an element opens. Only
// that scene is drawn and its stops listed; everything else stays on the canvas untouched.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createId } from "@paralleldrive/cuid2";
import type { ReactFlowInstance } from "@xyflow/react";
import {
  PRESENTATION_CAMERA_PADDING, createPresentationDetail, presentationCameraBounds, presentationDetails, presentationSceneElements,
  presentationSceneSteps, presentationSceneTrail, removePresentationDetail, type PresentationCanvasAction, type PresentationElement,
  type PresentationSceneId, type PresentationStep,
} from "../../lib/presentation";
import { nextDetailFrameBounds } from "../../lib/presentation-details";
import { wikiSectionElements, type WikiOutlineSection } from "../../lib/presentation-wiki-import";
import type { PresentationNode } from "../presentation-canvas";

const CAMERA_DURATION = 700;

export function useDetailScene({ elements, steps, dispatch, disabled, setSelectedIds, reactFlow }: {
  elements: PresentationElement[];
  steps: PresentationStep[];
  dispatch: (action: PresentationCanvasAction) => void;
  disabled: boolean;
  setSelectedIds: (ids: string[]) => void;
  reactFlow: ReactFlowInstance<PresentationNode>;
}) {
  const [requested, setRequested] = useState<PresentationSceneId>(null);
  const details = presentationDetails(elements);
  // A page deleted under the author (undo, a collaborator) drops them back to the overview.
  const sceneId = requested && details.boxByFrame.has(requested) ? requested : null;
  const sceneElements = useMemo(() => presentationSceneElements(elements, sceneId), [elements, sceneId]);
  const sceneSteps = useMemo(() => presentationSceneSteps(elements, steps, sceneId), [elements, steps, sceneId]);
  const trail = useMemo(() => presentationSceneTrail(elements, sceneId), [elements, sceneId]);

  const pendingFly = useRef(0);
  useEffect(() => () => cancelAnimationFrame(pendingFly.current), []);
  /** Waits two frames: the scene's nodes replace the old ones before the camera moves. */
  const fly = useCallback((bounds: { x: number; y: number; width: number; height: number }, padding = PRESENTATION_CAMERA_PADDING) => {
    cancelAnimationFrame(pendingFly.current);
    pendingFly.current = requestAnimationFrame(() => {
      pendingFly.current = requestAnimationFrame(() => void reactFlow.fitBounds(bounds, { padding, duration: CAMERA_DURATION }));
    });
  }, [reactFlow]);

  const show = useCallback((scene: PresentationSceneId, focus?: PresentationElement) => {
    setSelectedIds(focus && scene === null ? [focus.id] : []);
    setRequested(scene);
    if (focus) fly(presentationCameraBounds(focus), scene === null || focus.type !== "frame" ? 1.2 : PRESENTATION_CAMERA_PADDING);
  }, [fly, setSelectedIds]);

  /** Opens the detail page of `boxId`, creating it (with one stop on it) the first time. */
  const open = useCallback((boxId: string) => {
    const box = elements.find((element) => element.id === boxId);
    if (!box) return;
    const existing = details.frameByBox.get(boxId);
    const frame = existing ? elements.find((element) => element.id === existing) : undefined;
    if (frame) { show(frame.id, frame); return; }
    if (disabled || elements.length >= 500) return;
    const frameId = createId(), bounds = nextDetailFrameBounds(elements);
    dispatch({ type: "edit", at: Date.now(), separate: true,
      elements: (current) => createPresentationDetail(current, boxId, frameId),
      steps: (current) => [...current, { id: createId(), elementId: frameId }] });
    setSelectedIds([]);
    setRequested(frameId);
    fly(bounds);
  }, [details, disabled, dispatch, elements, fly, setSelectedIds, show]);

  /** Back to the scene around the open page, looking at the element that opens it. */
  const close = useCallback(() => {
    const current = trail.at(-1);
    if (current) show(trail.at(-2)?.frame.id ?? null, current.box);
  }, [show, trail]);

  /** Shows whichever scene holds `id`, e.g. for a link to an element on a detail page. */
  const reveal = useCallback((id: string) => setRequested(details.sceneOf(id)), [details]);

  const remove = useCallback((boxId: string) => {
    if (disabled || !details.frameByBox.has(boxId)) return;
    const frameId = details.frameByBox.get(boxId)!;
    const inside = sceneId !== null && (sceneId === frameId || trail.some(({ frame }) => frame.id === frameId));
    dispatch({ type: "edit", at: Date.now(), separate: true, elements: (current) => removePresentationDetail(current, boxId) });
    if (inside) setRequested(details.sceneOf(boxId));
  }, [details, disabled, dispatch, sceneId, trail]);

  /** Fills the open page with one wiki section, below whatever it already holds. */
  const importSection = useCallback((section: WikiOutlineSection) => {
    const frame = trail.at(-1)?.frame;
    if (disabled || !frame) return;
    const added = wikiSectionElements(section, frame, () => createId());
    if (elements.length + added.length > 500) return;
    dispatch({ type: "edit", at: Date.now(), separate: true, elements: (current) => [...current, ...added] });
    setSelectedIds(added.map((element) => element.id));
  }, [disabled, dispatch, elements.length, setSelectedIds, trail]);

  return { sceneId, elements: sceneElements, steps: sceneSteps, trail, frameByBox: details.frameByBox, open, close, show, reveal, remove, importSection };
}
