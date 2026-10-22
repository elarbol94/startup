"use client";
// The "choose one" dialog behind Add Shape / Add Chart / Add Icon. Used by presentation-editor.tsx.
import type { Dispatch, SetStateAction } from "react";
import type { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { presentationIconNames, presentationShapeKinds, type PresentationShapeKind } from "../../lib/presentation";
import type { usePresentationInsertion } from "./use-presentation-insertion";
import type { usePlacementFocus } from "./use-placement-focus";

export type InsertPicker = "shape" | "chart" | "icon" | null;

export function InsertPickerDialog({ insertPicker, setInsertPicker, placementFocus, addShape, addStudioElement, t, interact }: {
  insertPicker: InsertPicker;
  setInsertPicker: Dispatch<SetStateAction<InsertPicker>>;
  placementFocus: ReturnType<typeof usePlacementFocus>;
  addShape: ReturnType<typeof usePresentationInsertion>["addShape"];
  addStudioElement: ReturnType<typeof usePresentationInsertion>["addStudioElement"];
  t: ReturnType<typeof useTranslations<"wiki">>;
  interact: (key: string) => string;
}) {
  return <Dialog open={Boolean(insertPicker)} onOpenChange={open => { if (!open) setInsertPicker(null); }}><DialogContent finalFocus={placementFocus}><DialogHeader><DialogTitle>{interact("choose")}</DialogTitle></DialogHeader><div className="grid grid-cols-3 gap-2">{(insertPicker === "shape" ? presentationShapeKinds : insertPicker === "chart" ? ["bar", "line", "pie"] : insertPicker === "icon" ? presentationIconNames : []).map(choice => <Button key={choice} variant="outline" onClick={() => { if (insertPicker === "shape") addShape(choice as PresentationShapeKind); else if (insertPicker) addStudioElement(insertPicker, choice); setInsertPicker(null); }}>{insertPicker === "shape" ? t(`presentations.shapeKinds.${choice}`) : interact(insertPicker === "icon" ? `icons.${choice}` : choice)}</Button>)}</div></DialogContent></Dialog>;
}
