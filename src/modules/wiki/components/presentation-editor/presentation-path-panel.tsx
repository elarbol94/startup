"use client";
// The presentation path panel, a frame rail like PowerPoint's slide pane: sortable thumbnails
// of the stops in playback order, "New frame" for the next frame beside the last, and the
// active stop's duration and speaker notes. Used by presentation-editor.tsx.
import { useTranslations } from "next-intl";
import { DndContext, closestCenter, type DragEndEvent, type useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus, SquarePlus, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { useCollaborationContext } from "../../collaboration/ui";
import { parseSecondsInput, retargetStep, stepLabel, stepTarget, type PresentationCanvasAction, type PresentationElement, type PresentationSettings, type PresentationSnapshot, type PresentationStep } from "../../lib/presentation";
import { PresentationStepThumbnail } from "./presentation-step-thumbnail";
import type { PresentationRecord } from "../../presentation-queries";
import { DraftInput } from "./draft-fields";
import { STEP_DURATION_RANGE, msFromSecondsText, secondsText } from "./presentation-editor-utils";

export function PresentationPathPanel({
  presentation, steps, elements, selected, activeStep, activeStepId, setActiveStepId, setSelectedIds, flyTo, commitSteps, addStep,
  disabled, readOnly, sensors, onStepDragEnd, settings, updateStepDuration, updateStepNotes, collaboration, dispatch, scene, onNewFrame,
}: {
  /** The canvas as the thumbnails draw it. */
  scene: PresentationSnapshot;
  onNewFrame: () => void;
  presentation: PresentationRecord;
  steps: PresentationStep[];
  elements: PresentationElement[];
  selected: PresentationElement | null;
  activeStep: PresentationStep | null;
  activeStepId: string | null;
  setActiveStepId: (id: string | null) => void;
  setSelectedIds: (ids: string[]) => void;
  flyTo: (element: PresentationElement) => void;
  commitSteps: (update: (current: PresentationStep[]) => PresentationStep[]) => void;
  addStep: () => void;
  disabled: boolean;
  readOnly: boolean;
  sensors: ReturnType<typeof useSensors>;
  onStepDragEnd: (event: DragEndEvent) => void;
  settings: PresentationSettings;
  updateStepDuration: (id: string, durationMs: number | undefined) => void;
  updateStepNotes: (stepId: string, notes: string) => void;
  collaboration: ReturnType<typeof useCollaborationContext>;
  dispatch: (action: PresentationCanvasAction) => void;
}) {
  const t = useTranslations("wiki");
  const studio = useTranslations("presentationStudio");
  return (<>
    <p className="mt-1 text-xs text-muted-foreground">{t("presentations.pathDescription")}</p>
    <div className="mt-2 grid grid-cols-2 gap-1.5">
      <Button type="button" size="sm" disabled={disabled || steps.length >= 500 || scene.elements.length >= 500} onClick={onNewFrame}>
        <SquarePlus className="size-3.5" />{t("presentations.newFrame")}
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={!selected || disabled || steps.length >= 500} onClick={addStep}>
        <Plus className="size-3.5" />{t("presentations.addStep")}
      </Button>
    </div>
    {steps.length === 0 ? (
      <p className="mt-3 rounded-md border border-dashed p-3 text-xs text-muted-foreground">{t("presentations.noSteps")}</p>
    ) : (
      <DndContext id={`presentation-path-${presentation.id}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onStepDragEnd}>
        <SortableContext items={steps.map((step) => step.id)} strategy={verticalListSortingStrategy}>
          <ol className="mt-3 space-y-2" data-testid="presentation-frame-rail">
            {steps.map((step, index) => {
              const target = stepTarget(step, elements);
              return (
                <PresentationStepThumbnail
                  key={step.id}
                  step={step}
                  index={index}
                  scene={scene}
                  active={activeStepId === step.id}
                  missing={!target}
                  readOnly={readOnly}
                  label={`${step.action && step.action !== "camera" ? `${studio(step.action)}: ` : ""}${target ? stepLabel(target, index) : t("presentations.missingStep")}`}
                  removeLabel={t("presentations.removeStep")}
                  reorderLabel={t("presentations.reorderStep", { number: index + 1 })}
                  onSelect={() => {
                    setActiveStepId(step.id);
                    if (target) {
                      setSelectedIds([target.id]);
                      flyTo(target);
                    }
                  }}
                  onRemove={() => commitSteps((current) => current.filter((entry) => entry.id !== step.id))}
                />
              );
            })}
          </ol>
        </SortableContext>
      </DndContext>
    )}

    {activeStep && (
      <section className="mt-3 border-t pt-3">
        {selected && selected.id !== activeStep.elementId && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mb-3 w-full"
            disabled={readOnly}
            onClick={() => commitSteps((current) => retargetStep(current, activeStep.id, selected.id))}
          >
            <Target className="size-3.5" />
            {t("presentations.retargetStep")}
          </Button>
        )}
        <label className="block text-xs text-muted-foreground">
          {t("presentations.stepDuration")}
          <DraftInput
            type="number"
            min={0.5}
            max={120}
            step={0.5}
            className="mt-1 h-8"
            placeholder={secondsText(settings.defaultStepDurationMs)}
            value={activeStep.durationMs != null ? secondsText(activeStep.durationMs) : ""}
            // An empty field is not a bad entry here: it hands the step back to the default.
            normalise={(raw) => {
              const ms = raw.trim() ? (parseSecondsInput(raw, STEP_DURATION_RANGE) ?? activeStep.durationMs) : undefined;
              return ms == null ? "" : secondsText(ms);
            }}
            onCommit={(next) => updateStepDuration(activeStep.id, next ? msFromSecondsText(next) : undefined)}
          />
        </label>
        <p className="mt-1 text-[11px] text-muted-foreground">{t("presentations.stepDurationHint")}</p>
        <h2 className="mt-3 text-xs font-semibold tracking-wide uppercase">{t("presentations.speakerNotes")}</h2>
        <Textarea
          key={activeStep.id}
          aria-label={t("presentations.speakerNotes")}
          value={activeStep.notes ?? ""}
          maxLength={5_000}
          rows={4}
          className="mt-2"
          placeholder={t("presentations.speakerNotesPlaceholder")}
          onChange={(event) => updateStepNotes(activeStep.id, event.target.value)}
          onKeyDown={(event) => {
            if (collaboration && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
              event.preventDefault(); dispatch({ type: event.shiftKey ? "redo" : "undo" });
            }
          }}
        />
      </section>
    )}

</>);
}
