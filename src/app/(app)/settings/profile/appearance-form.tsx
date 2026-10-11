"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { SettingsCard, settingsChoiceClass, settingsRadioClass } from "../settings-card";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function AppearanceForm() {
  const t = useTranslations("settings.appearance");
  const { theme, setTheme } = useTheme();
  // Browser preferences are unknown during server rendering and hydration.
  const mounted = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);

  return (
    <SettingsCard title={t("title")} description={t("description")} descriptionId="appearance-description">
      <fieldset disabled={!mounted} aria-describedby="appearance-description">
        <legend className="mb-2 text-[13px] font-medium">{t("mode")}</legend>
        <div className="flex flex-wrap gap-2">
          {(["system", "light", "dark"] as const).map((mode) => (
            <label key={mode} className={settingsChoiceClass}>
              <input
                type="radio"
                name="appearance"
                value={mode}
                checked={mounted && theme === mode}
                onChange={() => setTheme(mode)}
                className={settingsRadioClass}
              />
              {t(mode)}
            </label>
          ))}
        </div>
      </fieldset>
    </SettingsCard>
  );
}
