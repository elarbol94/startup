"use client";

// Note prompt for a pending PDF annotation (text passage, region or bookmark), positioned
// next to the selection. Used by pdf-reader.tsx.
import { useState, type Dispatch, type SetStateAction } from "react";
import type { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { PdfRect } from "../../lib/pdf-evidence";
import type { PendingAnnotation } from "./pdf-reader-types";

function annotationPopupStyle(anchor: { left: number; top: number }) {
  const width = 384; const height = 260; const gap = 24;
  const placeRight = anchor.left + gap + width <= window.innerWidth - 16;
  const left = placeRight ? anchor.left + gap : Math.max(16, anchor.left - width - gap);
  const placeAbove = anchor.top - gap - height >= 16;
  const top = placeAbove ? anchor.top - gap : Math.min(window.innerHeight - 16, anchor.top + gap);
  return { left, top, transform: placeAbove ? "translateY(-100%)" : "translateY(0)" };
}

export function PdfAnnotationNoteDialog({
  t, pendingAnnotation, setPendingAnnotation, annotationAnchor, setAnnotationAnchor, annotationNote, setAnnotationNote,
  saveAnnotation,
}: {
  t: ReturnType<typeof useTranslations<"wiki">>;
  pendingAnnotation: PendingAnnotation | null;
  setPendingAnnotation: Dispatch<SetStateAction<PendingAnnotation | null>>;
  annotationAnchor: { left: number; top: number } | null;
  setAnnotationAnchor: Dispatch<SetStateAction<{ left: number; top: number } | null>>;
  annotationNote: string;
  setAnnotationNote: Dispatch<SetStateAction<string>>;
  saveAnnotation: (
    kind: "text" | "region" | "bookmark", geometry: PdfRect[], selectedText?: string, previewDataUrl?: string,
    annotationPageNumber?: number, note?: string,
  ) => Promise<string>;
}) {
  const [annotationSaving, setAnnotationSaving] = useState(false);

  async function submitPendingAnnotation() {
    if (!pendingAnnotation || annotationSaving) return;
    const annotation = pendingAnnotation;
    setAnnotationSaving(true);
    try {
      await saveAnnotation(
        annotation.kind,
        annotation.geometry,
        annotation.selectedText,
        annotation.previewDataUrl,
        annotation.pageNumber,
        annotationNote,
      );
      setPendingAnnotation(null);
    } catch {
      toast.error(t("annotationSaveFailed"));
    } finally {
      setAnnotationSaving(false);
    }
  }

  return <Dialog open={Boolean(pendingAnnotation)} onOpenChange={(open) => { if (!open && !annotationSaving) { setPendingAnnotation(null); setAnnotationAnchor(null); } }}><DialogContent style={annotationAnchor ? annotationPopupStyle(annotationAnchor) : undefined}><DialogHeader><DialogTitle>{t("annotationNotePrompt")}</DialogTitle></DialogHeader><Textarea autoFocus disabled={annotationSaving} value={annotationNote} onChange={(event) => setAnnotationNote(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void submitPendingAnnotation(); } }} rows={4} /><DialogFooter><Button variant="outline" disabled={annotationSaving} onClick={() => setPendingAnnotation(null)}>{t("cancel")}</Button><Button disabled={annotationSaving} onClick={() => void submitPendingAnnotation()}>{annotationSaving ? <><Loader2 className="animate-spin" />{t("saving")}</> : t("saveAnnotation")}</Button></DialogFooter></DialogContent></Dialog>
}
