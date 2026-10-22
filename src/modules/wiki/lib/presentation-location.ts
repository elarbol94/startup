import { presentationAncestors } from "./presentation-hierarchy";
import { presentationSceneTrail, sceneOfStop, type PresentationPosition, type PresentationStop } from "./presentation-details";
import type { PresentationElement } from "./presentation-model";

export type PresentationLocation = { sceneId?: string | null; stepId?: string | null };

/** Stable URL identities survive reordered paths. Rebuild the return trail so a reloaded
 * nested detail still exits one canvas at a time, including openers without path stops. */
export function restorePresentationLocation(
  elements: PresentationElement[], stops: PresentationStop[], location: PresentationLocation, startStepId?: string,
): PresentationPosition {
  const requestedScene = location.sceneId ?? null;
  const matching = stops.findIndex(stop => stop.step.id === location.stepId && stop.sceneId === requestedScene);
  const requested = matching >= 0 ? matching
    : location.sceneId ? stops.findIndex(stop => stop.sceneId === requestedScene) : -1;
  const start = startStepId ? stops.findIndex(stop => stop.step.id === startStepId) : -1;
  const index = requested >= 0 ? requested : start >= 0 ? start : stops.findIndex(stop => stop.sceneId === null);
  const returns: number[] = [];
  const trail = presentationSceneTrail(elements, sceneOfStop(stops, index));
  for (const [depth, { box }] of trail.entries()) {
    // An opener may have no stop; its nearest containing frame's stop is the next best
    // camera to return to. Otherwise use the containing scene's first stop.
    const ancestors = [box.id, ...presentationAncestors(elements, box.id).map(element => element.id)];
    const containingScene = depth > 0 ? trail[depth - 1].frame.id : null;
    const candidates = stops.map((stop, at) => ({ stop, at })).filter(({ stop }) => stop.sceneId === containingScene);
    const target = ancestors.map(id => candidates.find(({ stop }) => stop.step.elementId === id && (!stop.step.action || stop.step.action === "camera")))
      .find(Boolean) ?? candidates[0];
    if (target) returns.push(target.at);
  }
  return { index, returns };
}
