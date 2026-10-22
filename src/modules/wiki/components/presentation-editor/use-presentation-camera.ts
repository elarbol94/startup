"use client";
// The camera: flying to an element, and opening on the element a link asked for (?element=).
// Used by presentation-editor.tsx.
import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { useStore, type useReactFlow } from "@xyflow/react";
import { PRESENTATION_CAMERA_PADDING, presentationCameraBounds, type PresentationElement, type PresentationStep } from "../../lib/presentation";
import type { PresentationNode } from "../presentation-canvas";
import type { useDetailScene } from "./use-detail-scene";
import type { RibbonPanel } from "./ribbon/ribbon-model";

const CAMERA_DURATION = 700;

export function usePresentationCamera({ reactFlow, requestedElement, presentationId, elements, steps, detail, setSelectedIds, setActiveStepId, setActivePanel }: {
  reactFlow: ReturnType<typeof useReactFlow<PresentationNode>>;
  requestedElement: string | null;
  presentationId: string;
  elements: PresentationElement[];
  steps: PresentationStep[];
  detail: ReturnType<typeof useDetailScene>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  setActiveStepId: Dispatch<SetStateAction<string | null>>;
  setActivePanel: Dispatch<SetStateAction<RibbonPanel | null>>;
}) {
  // Canvas geometry is already stored; viewport sizing is the readiness signal.
  const viewportSized = useStore((state) => state.width > 0 && state.height > 0);
  const viewportEngine = useStore((state) => state.panZoom);

  const pendingFly = useRef(0);
  useEffect(() => () => cancelAnimationFrame(pendingFly.current), []);
  const flyTo = useCallback(
    (element: PresentationElement) => {
      cancelAnimationFrame(pendingFly.current);
      // Tool panels can open in the same selection event. Let the canvas resize
      // before fitting an explicitly requested stop; ordinary panel toggles do not pan.
      pendingFly.current = requestAnimationFrame(() => {
        pendingFly.current = requestAnimationFrame(() => {
          void reactFlow.fitBounds(presentationCameraBounds(element), { padding: PRESENTATION_CAMERA_PADDING, duration: CAMERA_DURATION });
        });
      });
    },
    [reactFlow],
  );

  const appliedNavigation = useRef("");
  const appliedViewportEngine = useRef(viewportEngine);
  useEffect(() => {
    if (!viewportEngine || !reactFlow.viewportInitialized || !viewportSized || !requestedElement) return;
    const navigationKey = `${presentationId}:${requestedElement}`;
    if (appliedNavigation.current === navigationKey && appliedViewportEngine.current === viewportEngine) return;
    // Next can reactivate a cached editor with a recreated pan/zoom controller.
    // Restore once per controller, as well as once per destination.
    const timer = setTimeout(() => {
      appliedNavigation.current = navigationKey;
      appliedViewportEngine.current = viewportEngine;
      const target = elements.find((element) => element.id === requestedElement);
      if (target) { detail.reveal(target.id); setSelectedIds([target.id]); setActiveStepId(steps.find((step) => step.elementId === target.id)?.id ?? null); flyTo(target); setActivePanel("properties"); }
      else void reactFlow.fitView({ padding: 0.2 });
    }, 0);
    return () => clearTimeout(timer);
  }, [elements, flyTo, viewportSized, presentationId, reactFlow, requestedElement, steps, viewportEngine, detail, setSelectedIds, setActiveStepId, setActivePanel]);

  return { flyTo };
}
