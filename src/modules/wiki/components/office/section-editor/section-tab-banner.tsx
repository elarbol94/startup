"use client";

import { useTranslations } from "next-intl";
import { ExternalLink, SquarePen, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SectionSession } from "./use-section-editor";

/**
 * Shown in the main document while one of its sections is open in a section
 * tab. Until that tab has the content (e.g. the browser blocked it) it offers
 * to open it on a click; "Verwerfen" releases the lock.
 */
export function SectionTabBanner({ session, onOpen, onDiscard }: {
  session: SectionSession;
  onOpen: () => void;
  onDiscard: () => void;
}) {
  const t = useTranslations("officeDocuments.sectionEditor");
  const title = session.title ?? t("startOfDocument");
  return <div data-testid="office-section-banner" role="status" className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-sky-500/30 bg-sky-500/5 px-3 py-1.5 text-sm">
    <SquarePen className="size-4 shrink-0 text-sky-600 dark:text-sky-400" />
    <span className="min-w-0 flex-1">
      {t("bannerOpen", { title })}
      {session.blocked && <span className="ml-1 text-muted-foreground">{t("bannerBlocked")}</span>}
    </span>
    {!session.connected && <Button type="button" size="sm" variant={session.blocked ? "default" : "outline"} onClick={onOpen}><ExternalLink className="size-4" />{t("openInTab")}</Button>}
    <Button type="button" size="sm" variant="ghost" onClick={onDiscard}><Undo2 className="size-4" />{t("discard")}</Button>
  </div>;
}
