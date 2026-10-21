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
  return <div data-testid="detail-scene-bar" className="absolute top-3 left-1/2 z-10 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-1 rounded-full border bg-background/95 py-1 pr-1 pl-1 shadow-md backdrop-blur">
    <Button type="button" variant="ghost" size="sm" className="rounded-full" onClick={onClose} title={`${t("close")} (Esc)`} aria-label={t("close")}>
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
    <span className="mx-1 h-5 w-px bg-border" />
    <Button type="button" variant="ghost" size="sm" className="rounded-full" disabled={disabled} onClick={onImport} data-testid="detail-import-wiki">
      <BookOpenText className="size-4" /><span className="hidden sm:inline">{t("importWiki")}</span>
    </Button>
  </div>;
}
