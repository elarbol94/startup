"use client";

import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip";

/** Switches between light and dark. Both icons render and CSS picks one, so SSR and hydration agree. */
export function ThemeToggle() {
  const t = useTranslations("nav");
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <ShortcutTooltip label={t("toggleTheme")} side="right">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t("toggleTheme")}
        className="shrink-0 text-text-secondary"
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      >
        <Sun className="hidden dark:block" />
        <Moon className="dark:hidden" />
      </Button>
    </ShortcutTooltip>
  );
}
