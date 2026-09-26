"use client";
// The presentation editor's header save state. Used by presentation-editor.tsx.
import { Check, CloudOff, Loader2, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PresentationSaveState } from "../../lib/presentation-save-state";

export function PresentationSaveIndicator({ state }: { state: PresentationSaveState }) {
  const t = useTranslations("wiki.presentations.saveStates");
  return {
    idle: null,
    unsaved: <span className="text-muted-foreground">{t("unsaved")}</span>,
    saving: <span className="flex items-center gap-1 text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />{t("saving")}</span>,
    saved: <span className="flex items-center gap-1 text-muted-foreground"><Check className="size-3.5" />{t("saved")}</span>,
    // A refused write leaves the changes unsaved; the Save button next to it retries.
    error: <span className="flex items-center gap-1 text-destructive"><TriangleAlert className="size-3.5" />{t("unsaved")}</span>,
    offline: <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400"><CloudOff className="size-3.5" />{t("offline")}</span>,
  }[state];
}
