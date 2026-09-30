"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function AppearanceForm() {
  const t = useTranslations("settings.appearance");
  const { theme, setTheme } = useTheme();
  // Browser preferences are unknown during server rendering and hydration.
  const mounted = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription id="appearance-description">{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <fieldset disabled={!mounted} aria-describedby="appearance-description">
          <legend className="mb-3 text-sm font-medium">{t("mode")}</legend>
          <div className="flex flex-wrap gap-3">
            {(["system", "light", "dark"] as const).map((mode) => (
              <label key={mode} className="flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-3 text-sm has-checked:border-primary has-checked:bg-accent has-focus-visible:ring-2 has-focus-visible:ring-ring">
                <input
                  type="radio"
                  name="appearance"
                  value={mode}
                  checked={mounted && theme === mode}
                  onChange={() => setTheme(mode)}
                  className="size-4 accent-primary"
                />
                {t(mode)}
              </label>
            ))}
          </div>
        </fieldset>
      </CardContent>
    </Card>
  );
}
