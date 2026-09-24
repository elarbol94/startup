// The presentation path: step parsing, ordering, targets, labels, click handling and
// fade visibility. Re-exported by presentation.ts.
import { elementBounds } from "./presentation-geometry";
import { presentationDescendants } from "./presentation-hierarchy";
import { presentationStepsSchema, type PresentationElement, type PresentationSettings, type PresentationStep } from "./presentation-model";

export function parsePresentationSteps(json: string): PresentationStep[] {
  try {
    return presentationStepsSchema.parse(JSON.parse(json));
  } catch {
    return [];
  }
}

/**
 * Steps whose element was deleted would fly the camera nowhere, so they are dropped on
 * read rather than on delete — a step list is only ever as valid as the canvas it points at.
 */
export function normalizeSteps(
  steps: PresentationStep[],
  elements: PresentationElement[],
): PresentationStep[] {
  const known = new Set(elements.map((element) => element.id));
  const seen = new Set<string>();
  return steps.filter((step) => {
    if (!known.has(step.elementId) || seen.has(step.id)) return false;
    seen.add(step.id);
    return true;
  });
}

export function moveStep(steps: PresentationStep[], from: number, to: number): PresentationStep[] {
  if (from === to || from < 0 || to < 0 || from >= steps.length || to >= steps.length) return steps;
  const next = [...steps];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** The element a step points at, or null once the canvas no longer contains it. */
export function stepTarget(
  step: PresentationStep,
  elements: PresentationElement[],
): PresentationElement | null {
  return elements.find((element) => element.id === step.elementId) ?? null;
}

/**
 * The step a clicked element should jump to — the click-to-jump counterpart of `stepTarget`.
 * When several steps target the same element, the lowest-indexed one wins, matching the
 * order the presenter walks the path in. Null means no step points here: a free-look click.
 */
export function stepIndexForElement(steps: PresentationStep[], elementId: string): number | null {
  const index = steps.findIndex((step) => step.elementId === elementId && (!step.action || step.action === "camera"));
  return index === -1 ? null : index;
}

/**
 * A duration field types seconds and stores milliseconds. The clamp happens once, here, on
 * a finished entry -- clamping every keystroke is what turns a typed "0.4" into 0.14 --
 * and `null` means "nothing usable was typed", which the editor reads as leaving the
 * stored value alone rather than as a zero.
 */
export function parseSecondsInput(raw: string, range: { min: number; max: number }): number | null {
  const trimmed = raw.trim();
  const seconds = Number(trimmed);
  if (!trimmed || !Number.isFinite(seconds)) return null;
  return Math.round(Math.min(range.max, Math.max(range.min, seconds * 1000)));
}

/** A step's own duration wins over the presentation's default autoplay pacing. */
export function resolveStepDuration(step: PresentationStep, settings: PresentationSettings): number {
  return step.durationMs ?? settings.defaultStepDurationMs;
}

/** Elements that belong to a step's target — the target itself, plus anything nested
 * inside its bounds — which is what fades in together when the step arrives. */
export function elementsWithinStep(
  target: PresentationElement,
  elements: PresentationElement[],
): PresentationElement[] {
  const bounds = elementBounds(target);
  return elements.filter((element) => {
    if (element.id === target.id) return true;
    const box = elementBounds(element);
    return (
      box.x >= bounds.x &&
      box.y >= bounds.y &&
      box.x + box.width <= bounds.x + bounds.width &&
      box.y + box.height <= bounds.y + bounds.height
    );
  });
}

/**
 * What a click on a canvas element means while presenting. A frame the presenter is
 * already looking *inside* — the current step's own target, or any frame enclosing it —
 * is the slide itself, so clicking it advances exactly like clicking empty canvas;
 * Prezi-style decks that wrap everything in an overview frame would otherwise lose
 * click-to-advance entirely. Anything else keeps click-to-jump ("look" when no step
 * targets it). Containment is axis-aligned, matching `elementsWithinStep`.
 */
export type PresentationClickAction =
  | { kind: "advance" }
  | { kind: "jump"; index: number }
  | { kind: "look" };

export function elementClickAction(
  steps: PresentationStep[],
  elements: PresentationElement[],
  currentIndex: number,
  elementId: string,
): PresentationClickAction {
  const element = elements.find((candidate) => candidate.id === elementId);
  const step = presentationCameraStep(steps, currentIndex);
  const current = element && step ? stepTarget(step, elements) : null;
  if (element?.type === "frame" && current && elementsWithinStep(element, elements).some((within) => within.id === current.id)) {
    return { kind: "advance" };
  }
  const matched = stepIndexForElement(steps, elementId);
  return matched === null ? { kind: "look" } : { kind: "jump", index: matched };
}

/** Retargeting a step keeps its id, duration and notes — only the camera target moves. */
export function retargetStep(
  steps: PresentationStep[],
  stepId: string,
  elementId: string,
): PresentationStep[] {
  return steps.map((step) => (step.id === stepId ? { ...step, elementId } : step));
}

export function stepLabel(element: PresentationElement, index: number): string {
  const raw =
    element.type === "frame" ? element.content.label
      : element.type === "text" ? element.content.text
        : element.type === "image" ? element.content.alt
          // A shape has no words of its own, so it is named by its position in the path.
          : "";
  const trimmed = raw.trim().replace(/\s+/g, " ");
  return trimmed ? trimmed.slice(0, 60) : `${index + 1}`;
}

export function presentationCameraStep(steps: PresentationStep[], index: number): PresentationStep | undefined {
  for (let i = index; i >= 0; i--) if (!steps[i]?.action || steps[i].action === "camera") return steps[i];
  return undefined;
}

/** Replaying from the beginning makes backwards navigation, jumps and live following deterministic. */
export function presentationHiddenIds(elements: PresentationElement[], steps: PresentationStep[], index: number): Set<string> {
  const hidden = new Set<string>();
  const initialized = new Set<string>();
  for (const step of steps) {
    if (!step.action || step.action === "camera") continue;
    for (const id of presentationDescendants(elements, new Set([step.elementId]))) {
      if (!initialized.has(id) && step.action === "fadeIn") hidden.add(id);
      initialized.add(id);
    }
  }
  for (const step of steps.slice(0, index + 1)) {
    if (!step.action || step.action === "camera") continue;
    for (const id of presentationDescendants(elements, new Set([step.elementId]))) {
      if (step.action === "fadeIn") hidden.delete(id); else hidden.add(id);
    }
  }
  return hidden;
}
