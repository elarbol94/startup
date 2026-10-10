"use client";

import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Crosshair, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OfficeSection } from "./office-sections";

/** Slim bar above the editor while a section is focused. */
export function OfficeSectionFocusBar({ section, onPrevious, onNext, onExit }: {
  section: OfficeSection;
  onPrevious: () => void;
  onNext: () => void;
  onExit: () => void;
}) {
  const t = useTranslations("officeDocuments.sectionFocus");
  const title = section.title ?? t("startOfDocument");
  return <div data-testid="office-section-focus" role="region" aria-label={t("label")} className="mb-2 flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1">
    <Crosshair className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    <p className="min-w-0 flex-1 truncate text-sm font-medium" title={title}>{title}</p>
    <Button type="button" variant="ghost" size="icon-sm" disabled={section.previous === null} aria-label={t("previous")} title={t("previous")} onClick={onPrevious}><ChevronLeft className="size-4" /></Button>
    <Button type="button" variant="ghost" size="icon-sm" disabled={section.next === null} aria-label={t("next")} title={t("next")} onClick={onNext}><ChevronRight className="size-4" /></Button>
    <Button type="button" variant="ghost" size="sm" onClick={onExit}><X className="size-4" /><span className="hidden sm:inline">{t("exit")}</span></Button>
  </div>;
}
