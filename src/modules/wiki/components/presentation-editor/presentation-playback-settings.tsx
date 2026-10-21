"use client";
// Playback settings of a presentation (default step duration, loop, camera transition and
// easing), shown in the editor's workspace dialog. Used by presentation-editor.tsx.
import { useLocale, useTranslations } from "next-intl";
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
  const locale = useLocale();
  // The allowed range under each field, so a clamped value never comes as a surprise.
  const range = (min: number, max: number) => <span className="mt-0.5 block text-[11px]">{t("presentations.rangeHint", { min: min.toLocaleString(locale), max: max.toLocaleString(locale) })}</span>;
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
              {range(STEP_DURATION_RANGE.min / 1000, STEP_DURATION_RANGE.max / 1000)}
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={settings.loop} onCheckedChange={(checked) => updateSettings({ loop: checked === true })} />
              {t("presentations.loopPlayback")}
            </label>
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <Checkbox className="mt-0.5" checked={settings.motion === "always"} onCheckedChange={(checked) => updateSettings({ motion: checked === true ? "always" : "system" })} />
              {t("presentations.motionAlways")}
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
              {range(CAMERA_TRANSITION_RANGE.min / 1000, CAMERA_TRANSITION_RANGE.max / 1000)}
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
