"use client";

import { useTranslations } from "next-intl";
import { BookOpenText, ChevronRight, CornerLeftUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { presentationElementCaption, type PresentationElement, type PresentationSceneId } from "../../lib/presentation";

/**
 * Where the author is while a detail page is open: the way back up as a breadcrumb, plus
 * the page's own tools. Hidden on the overview, so the plain canvas looks as before.
 */
export function DetailSceneBar({ trail, onShow, onClose, onImport, disabled }: {
  trail: { frame: PresentationElement; box: PresentationElement }[];
  onShow: (scene: PresentationSceneId, focus: PresentationElement) => void;
  onClose: () => void;
  onImport: () => void;
  disabled: boolean;
}) {
  const t = useTranslations("wiki.presentations.details");
  const current = trail.at(-1);
  if (!current) return null;
  const name = (box: PresentationElement, frame: PresentationElement) => presentationElementCaption(box) || presentationElementCaption(frame) || t("group");
  return <div data-testid="detail-scene-bar" className="flex min-w-0 shrink-0 items-center gap-1 border-b bg-indigo-500/10 px-2 py-1">
    <Button type="button" variant="ghost" size="sm" onClick={onClose} title={`${t("close")} (Esc)`} aria-label={t("close")}>
      <CornerLeftUp className="size-4" />
    </Button>
    <nav aria-label={t("trail")} className="flex min-w-0 items-center gap-0.5 text-sm">
      <button type="button" className="shrink-0 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => onShow(null, trail[0].box)}>{t("overview")}</button>
      {trail.map(({ frame, box }, index) => <span key={frame.id} className="flex min-w-0 items-center gap-0.5">
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        {index === trail.length - 1
          ? <span aria-current="page" className="truncate px-1.5 py-0.5 font-medium">{name(box, frame)}</span>
          : <button type="button" className="truncate rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => onShow(frame.id, trail[index + 1].box)}>{name(box, frame)}</button>}
      </span>)}
    </nav>
    <span className="hidden min-w-0 truncate text-xs text-muted-foreground lg:inline">{t("editing", { name: name(current.box, current.frame) })}</span>
    <Button type="button" variant="ghost" size="sm" className="ml-auto shrink-0" disabled={disabled} onClick={onImport} data-testid="detail-import-wiki">
      <BookOpenText className="size-4" /><span className="hidden sm:inline">{t("importWiki")}</span>
    </Button>
  </div>;
}
