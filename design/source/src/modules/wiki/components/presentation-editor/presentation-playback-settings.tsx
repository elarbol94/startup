"use client";
// Playback settings of a presentation (default step duration, loop, camera transition and
// easing), shown in the editor's workspace dialog. Used by presentation-editor.tsx.
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { parseSecondsInput, presentationCameraEasings, type PresentationCameraEasing, type PresentationSettings } from "../../lib/presentation";
import { DraftInput } from "./draft-fields";
import { CAMERA_TRANSITION_RANGE, STEP_DURATION_RANGE, msFromSecondsText, secondsText } from "./presentation-editor-utils";

export function PresentationPlaybackSettings({ disabled, settings, updateSettings }: {
  disabled: boolean;
  settings: PresentationSettings;
  updateSettings: (update: Partial<PresentationSettings>) => void;
}) {
  const t = useTranslations("wiki");
  return (
          <>            <fieldset disabled={disabled} className="space-y-3">
            <label className="block text-xs text-muted-foreground">
              {t("presentations.defaultStepDuration")}
              <DraftInput
                type="number"
                min={0.5}
                max={120}
                step={0.5}
                className="mt-1 h-8"
                value={secondsText(settings.defaultStepDurationMs)}
                normalise={(raw) => secondsText(parseSecondsInput(raw, STEP_DURATION_RANGE) ?? settings.defaultStepDurationMs)}
                onCommit={(next) => updateSettings({ defaultStepDurationMs: msFromSecondsText(next) })}
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={settings.loop} onCheckedChange={(checked) => updateSettings({ loop: checked === true })} />
              {t("presentations.loopPlayback")}
            </label>
            <label className="block text-xs text-muted-foreground">
              {t("presentations.cameraTransition")}
              <DraftInput
                type="number"
                min={0.1}
                max={5}
                step={0.1}
                className="mt-1 h-8"
                value={secondsText(settings.cameraTransitionMs)}
                normalise={(raw) => secondsText(parseSecondsInput(raw, CAMERA_TRANSITION_RANGE) ?? settings.cameraTransitionMs)}
                onCommit={(next) => updateSettings({ cameraTransitionMs: msFromSecondsText(next) })}
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              {t("presentations.cameraEasing")}
              <select
                className="mt-1 h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none dark:bg-input/30"
                value={settings.cameraEasing}
                onChange={(event) => updateSettings({ cameraEasing: event.target.value as PresentationCameraEasing })}
              >
                {presentationCameraEasings.map((easing) => (
                  <option key={easing} value={easing}>{t(`presentations.easings.${easing}`)}</option>
                ))}
              </select>
            </label>
            </fieldset>
</>
  );
}
