"use client";
// The path's stops: adding one for the selection, their notes and durations, and reordering
// them by drag in the rail. Used by presentation-editor.tsx.
import { useCallback, type Dispatch, type SetStateAction } from "react";
import { createId } from "@paralleldrive/cuid2";
import { KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { moveStep, type PresentationElement, type PresentationStep } from "../../lib/presentation";

export function usePresentationSteps({ commitSteps, selected, disabled, readOnly, setActiveStepId }: {
  commitSteps: (update: (current: PresentationStep[]) => PresentationStep[]) => void;
  selected: PresentationElement | null;
  disabled: boolean;
  readOnly: boolean;
  setActiveStepId: Dispatch<SetStateAction<string | null>>;
}) {
  const updateStepDuration = useCallback(
    (id: string, durationMs: number | undefined) => {
      commitSteps((current) => current.map((step) => (step.id === id ? { ...step, durationMs } : step)));
    },
    [commitSteps],
  );

  const addStep = useCallback(() => {
    if (!selected || disabled) return;
    const step = { id: createId(), elementId: selected.id };
    commitSteps((current) => [...current, step]);
    setActiveStepId(step.id);
  }, [commitSteps, selected, disabled, setActiveStepId]);

  const updateStepNotes = useCallback(
    (stepId: string, notes: string) => {
      commitSteps((current) =>
        current.map((step) => (step.id === stepId ? { ...step, notes: notes || undefined } : step)),
      );
    },
    [commitSteps],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onStepDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (readOnly || !over || active.id === over.id) return;
    commitSteps((current) => moveStep(
      current,
      current.findIndex((step) => step.id === active.id),
      current.findIndex((step) => step.id === over.id),
    ));
  }, [commitSteps, readOnly]);

  return { updateStepDuration, addStep, updateStepNotes, sensors, onStepDragEnd };
}
