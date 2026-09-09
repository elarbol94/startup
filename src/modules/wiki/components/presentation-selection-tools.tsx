"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { presentationAlignments, type PresentationAlignment } from "../lib/presentation-layout";
import { presentationObjectTools } from "../lib/presentation-tools";
import type { PresentationElement } from "../lib/presentation";

/** The selected object's entry point: visible actions rather than hidden menu prerequisites. */
export function PresentationSelectionTools({ elements, selection, disabled, arrangeDisabled, rootCount, onConnect, onArrange, onJump }: {
  elements: PresentationElement[]; selection: PresentationElement[]; disabled: boolean;
  arrangeDisabled: boolean; rootCount: number;
  onConnect: (fromId: string, toId: string) => void;
  onArrange: (mode: PresentationAlignment) => void;
  onJump: (section: "appearance" | "content" | "structure" | "animation") => void;
}) {
  const t = useTranslations("wiki.presentations");
  const [targetId, setTargetId] = useState("");
  const available = presentationObjectTools(selection);
  const source = selection.length === 1 ? selection[0] : undefined;
  const candidates = elements.filter(e => e.id !== source?.id && presentationObjectTools([e]).connect);
  const targetLabel = (element: PresentationElement) => {
    if (element.type === "text") return element.content.text.slice(0, 55) || t("elementTypes.text");
    if (element.type === "frame") {
      const heading = elements.find(child => child.parentId === element.id && child.type === "text");
      return element.content.label || (heading?.type === "text" && heading.content.text.slice(0, 55)) || t("elementTypes.frame");
    }
    return t(`elementTypes.${element.type}`);
  };
  const isConnector = source?.type === "shape" && source.content.connection;
  return <section className="space-y-3" aria-label={t("selectionTools.title")}>
    <h2 className="text-xs font-medium text-muted-foreground">{t("selectionTools.title")}</h2>
    <div className="grid grid-cols-2 gap-2">
      {(["appearance", "content", "structure", "animation"] as const).filter(section => available[section]).map(section => <Button key={section} size="sm" variant="outline" type="button" disabled={!source && (section === "appearance" || section === "content")} onClick={() => onJump(section)}>{t(`selectionTools.${section}`)}</Button>)}
    </div>
    {available.connect && <details name="presentation-inspector" className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">{t("layout.connect")}</summary>
    <fieldset disabled={disabled} className="mt-3 space-y-3">
      {source && !isConnector ? <>
        <label className="block text-xs" htmlFor="presentation-connector-target">{t("selectionTools.target")}</label>
        <select id="presentation-connector-target" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={targetId} onChange={event => setTargetId(event.target.value)}>
          <option value="">{t("selectionTools.chooseTarget")}</option>
          {candidates.map((e, index) => <option key={e.id} value={e.id}>{index + 1}. {targetLabel(e)}</option>)}
        </select>
        <Button type="button" size="sm" className="w-full" disabled={!candidates.some(e => e.id === targetId) || elements.length >= 500} onClick={() => onConnect(source.id, targetId)}>{t("selectionTools.addConnector")}</Button>
        {!candidates.length && <p className="text-xs text-muted-foreground">{t("selectionTools.noTargets")}</p>}
      </> : isConnector ? <p className="text-xs text-muted-foreground">{t("layout.connectedHint")}</p> : <>
        <Button type="button" size="sm" className="w-full" disabled={arrangeDisabled || rootCount !== 2 || selection.length !== 2 || elements.length >= 500} onClick={() => {
          if (selection.length === 2) onConnect(selection[0].id, selection[1].id);
        }}>{t("selectionTools.addConnector")}</Button>
        <p className="text-xs text-muted-foreground">{t("selectionTools.twoObjects")}</p>
      </>}
    </fieldset></details>}
    {selection.length > 1 && <details name="presentation-inspector" className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-medium">{t("layout.arrange")}</summary>
      <div className="mt-3 space-y-2">
      {selection.length > 1 ? <div className="grid grid-cols-2 gap-2">
        {presentationAlignments.map(mode => <Button key={mode} type="button" size="sm" variant="outline" className="h-auto min-h-8 whitespace-normal text-xs" disabled={disabled || arrangeDisabled || rootCount < ((mode === "horizontal" || mode === "vertical") ? 3 : 2)} onClick={() => onArrange(mode)}>{t(`layout.${mode}`)}</Button>)}
      </div> : <p className="text-xs text-muted-foreground">{t("selectionTools.multiSelectHint")}</p>}
    </div></details>}
  </section>;
}
