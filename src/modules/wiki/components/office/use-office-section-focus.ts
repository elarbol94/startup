"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useFocusMode } from "@/components/focus-mode";
import { resolveSectionTarget, type OfficeSection } from "./office-sections";
import type { OfficeCommand, PluginEvent } from "./use-office-bridge";

type FocusedSection = OfficeSection & {
  /** Focus mode was off when the section was focused: exiting turns it off again. */
  ownsFocus: boolean;
  /** Global focus was on before; exiting reader focus clears it, so it is restored. */
  restoreGlobal: boolean;
};

/**
 * "Focus on section" from the editor's context menu: turns on the page's focus
 * mode, moves the cursor to the section heading and keeps the section shown in
 * a bar with previous/next/exit. The document itself is never changed.
 */
export function useOfficeSectionFocus(send: (command: OfficeCommand) => void) {
  const t = useTranslations("officeDocuments.sectionFocus");
  const focus = useFocusMode();
  const [section, setSection] = useState<FocusedSection | null>(null);
  const focusRef = useRef(focus);
  useEffect(() => { focusRef.current = focus; });

  // Leaving focus mode by other means (toggle, shortcut) also ends section focus.
  const [wasFocused, setWasFocused] = useState(focus.isFocused);
  if (wasFocused !== focus.isFocused) {
    setWasFocused(focus.isFocused);
    if (!focus.isFocused && section) setSection(null);
  }

  const onOutline = useCallback((event: Extract<PluginEvent, { type: "outline" }>) => {
    const reason = event.reason === "previous" || event.reason === "next" ? event.reason : "focus";
    const target = resolveSectionTarget(Array.isArray(event.headings) ? event.headings : [], event.cursor, reason);
    if (!target) {
      if (reason === "focus") toast.info(t("noPosition"));
      return;
    }
    send({ command: "goToParagraph", index: target.index });
    const { isFocused, globalFocused, toggleFocused } = focusRef.current;
    setSection((current) => ({
      ...target.section,
      ownsFocus: current ? current.ownsFocus : !isFocused,
      restoreGlobal: current ? current.restoreGlobal : !isFocused && globalFocused,
    }));
    if (!isFocused) toggleFocused();
  }, [send, t]);

  const move = useCallback((reason: "previous" | "next") => send({ command: "readOutline", reason }), [send]);

  const exit = useCallback(() => {
    const { isFocused, toggleFocused, setGlobalFocused } = focusRef.current;
    if (section?.ownsFocus && isFocused) {
      toggleFocused();
      if (section.restoreGlobal) setGlobalFocused(true);
    }
    setSection(null);
  }, [section]);

  return { section, onOutline, previous: () => move("previous"), next: () => move("next"), exit };
}
