/**
 * A presentation is a single infinite canvas plus an ordered path across it. Elements
 * carry their own geometry; a step is only a reference to one of them, so moving or
 * resizing an element automatically moves the camera target that points at it.
 */

export {
  presentationFrameShapes,
  type PresentationFrameShape,
  presentationElementTypes,
  type PresentationElementType,
  presentationShapeKinds,
  type PresentationShapeKind,
  presentationFonts,
  presentationFontFamilies,
  presentationLinkSchema,
  presentationTextRunSchema,
  presentationIconNames,
  presentationElementSchema,
  type PresentationElement,
  type PresentationTextElement,
  type PresentationImageElement,
  type PresentationFrameElement,
  type PresentationShapeElement,
  presentationStepSchema,
  type PresentationStep,
  presentationElementsSchema,
  presentationStepsSchema,
  presentationCameraEasings,
  type PresentationCameraEasing,
  presentationSettingsSchema,
  type PresentationSettings,
  defaultPresentationSettings,
  presentationCameraEasingFns,
  type PresentationBounds,
  PRESENTATION_CAMERA_PADDING,
  presentationCanvasSchema,
  type PresentationCanvas,
  parsePresentationCanvas,
} from "./presentation-model";
export {
  elementBounds,
  presentationCameraBounds,
  unionBounds,
  PRESENTATION_PAGE_SIZE,
  type PresentationPageTransform,
  fitBoundsToPage,
  normalizeRotation,
} from "./presentation-geometry";
export {
  reorderElement,
  PRESENTATION_DUPLICATE_OFFSET,
  duplicateElement,
  presentationAncestors,
  presentationDescendants,
  isPresentationElementLocked,
  groupPresentationElements,
  ungroupPresentationElements,
  duplicatePresentationTree,
} from "./presentation-hierarchy";
export {
  parsePresentationSteps,
  normalizeSteps,
  moveStep,
  stepTarget,
  stepIndexForElement,
  parseSecondsInput,
  resolveStepDuration,
  elementsWithinStep,
  type PresentationClickAction,
  elementClickAction,
  retargetStep,
  stepLabel,
  presentationCameraStep,
  presentationHiddenIds,
} from "./presentation-steps";
export {
  PRESENTATION_MIN_ELEMENT_SIZE,
  PRESENTATION_SNAP_TOLERANCE,
  type SnapGuide,
  snapBounds,
  type PresentationGeometryChange,
  applyGeometryChanges,
  rotateElements,
  scaleElements,
} from "./presentation-transform";
export {
  PRESENTATION_HISTORY_COALESCE_MS,
  PRESENTATION_HISTORY_LIMIT,
  type PresentationSnapshot,
  presentationSnapshotSchema,
  type PresentationCanvasState,
  type PresentationCanvasAction,
  initialPresentationCanvasState,
  presentationCanvasReducer,
} from "./presentation-canvas-state";

/**
 * Revision and lease policy, copied from the wiki page editor so both editors behave the
 * same: one automatic snapshot per author per five minutes, and a lease that dies sixty
 * seconds after the last heartbeat.
 */
export const PRESENTATION_REVISION_THROTTLE_MS = 5 * 60_000;
export const PRESENTATION_LEASE_TIMEOUT_MS = 60_000;

/** A burst of autosaves must leave one snapshot, not one per keystroke pause. */
export function shouldSnapshotRevision(lastRevisionAt: number | null, now: number): boolean {
  return lastRevisionAt === null || now - lastRevisionAt > PRESENTATION_REVISION_THROTTLE_MS;
}

/**
 * True while a live lease blocks this claim: another session still inside the timeout,
 * including another session of the same user unless the claim asks to take over.
 * A reload mints a fresh sessionId without releasing the old lease, so a claim may ask to
 * take over — which only works against the same user's lease, never another author's.
 */
export function isLeaseHeld(
  lease: { sessionId: string; userId: string; heartbeatAt: number } | null,
  claim: { sessionId: string; userId: string; takeover?: boolean },
  now: number,
): boolean {
  if (!lease || now - lease.heartbeatAt > PRESENTATION_LEASE_TIMEOUT_MS) return false;
  if (lease.sessionId === claim.sessionId) return false;
  return !(claim.takeover === true && lease.userId === claim.userId);
}
