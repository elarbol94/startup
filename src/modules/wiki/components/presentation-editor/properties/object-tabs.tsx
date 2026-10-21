"use client";
// Eigenschaften tabs and sections shared by several kinds of object: the shape's own fields
// (line routing, corner radius, transparency, connector), connecting to another object,
// Animation, and Arrange for several selected objects.
import { useState } from "react";
import { useTranslations } from "next-intl";
import { createId } from "@paralleldrive/cuid2";
import { AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalSpaceAround, AlignStartHorizontal, AlignStartVertical, AlignVerticalSpaceAround, Group, Link2, Ungroup } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PresentationElement, PresentationStep } from "../../../lib/presentation";
import { isLinearShape } from "../../../lib/presentation-interactions";
import { presentationAlignments, type PresentationAlignment } from "../../../lib/presentation-layout";
import { presentationObjectTools } from "../../../lib/presentation-tools";
import { FormatSection, NumberField, PercentField, SelectField } from "../format-pane/format-controls";
import { elementName, typeKey } from "./properties-header";

type Shape = Extract<PresentationElement, { type: "shape" }>;

const ARRANGE_ICONS: Record<PresentationAlignment, typeof AlignStartVertical> = {
  left: AlignStartVertical, center: AlignCenterVertical, right: AlignEndVertical, top: AlignStartHorizontal, middle: AlignCenterHorizontal, bottom: AlignEndHorizontal,
  horizontal: AlignHorizontalSpaceAround, vertical: AlignVerticalSpaceAround,
};

/** Above Fill & Line: what only this shape has. Lines route and glue; boxes round their corners. */
export function ShapeSection({ shape, disabled, onRoute, onDetach, set }: {
  shape: Shape; disabled: boolean;
  onRoute: (route: "straight" | "elbow" | "curve") => void; onDetach: () => void;
  set: (patch: Partial<Shape["content"]>) => void;
}) {
  const t = useTranslations("wiki.presentations");
  const linear = isLinearShape(shape);
  return <FormatSection title={t("elementTypes.shape")} open testId="properties-shape">
    <fieldset disabled={disabled} className="space-y-2">
      {linear && <SelectField label={t("interactions.route")} value={shape.content.route ?? "straight"} testId="presentation-line-route"
        options={(["straight", "elbow", "curve"] as const).map((route) => ({ value: route, label: t(`interactions.route${route[0].toUpperCase()}${route.slice(1)}`) }))} onChange={onRoute} />}
      {shape.content.shape === "roundedRect" && <NumberField label={t("interactions.cornerRadius")} value={shape.content.cornerRadius ?? 20} min={0} max={1000} onChange={(cornerRadius) => set({ cornerRadius })} />}
      <PercentField label={t("properties.transparency")} value={1 - shape.content.opacity} onChange={(transparency) => set({ opacity: Math.round((1 - transparency) * 100) / 100 })} />
      {shape.content.connection && <div className="space-y-1.5 rounded-md bg-muted/50 p-2">
        <p className="text-xs text-muted-foreground">{t("layout.connectedHint")}</p>
        <Button type="button" size="xs" variant="outline" onClick={onDetach}>{t("layout.detach")}</Button>
      </div>}
    </fieldset>
  </FormatSection>;
}

/** "Verbinden mit": a connector from this object to another one, picked by name. */
export function ConnectSection({ source, elements, disabled, onConnect }: {
  source: PresentationElement; elements: PresentationElement[]; disabled: boolean; onConnect: (fromId: string, toId: string) => void;
}) {
  const t = useTranslations("wiki.presentations");
  const [targetId, setTargetId] = useState("");
  if (!presentationObjectTools([source]).connect) return null;
  const candidates = elements.filter((element) => element.id !== source.id && presentationObjectTools([element]).connect);
  const name = (element: PresentationElement) => elementName(element, elements) || t(`elementTypes.${typeKey(element)}`);
  return <FormatSection title={t("layout.connect")} testId="properties-connect">
    {candidates.length ? <fieldset disabled={disabled} className="space-y-2">
      <SelectField label={t("selectionTools.target")} value={targetId} onChange={setTargetId}
        options={[{ value: "", label: t("selectionTools.chooseTarget") }, ...candidates.map((element, index) => ({ value: element.id, label: `${index + 1}. ${name(element)}` }))]} />
      <Button type="button" size="sm" className="w-full" disabled={!candidates.some((element) => element.id === targetId) || elements.length >= 500}
        onClick={() => { onConnect(source.id, targetId); setTargetId(""); }}><Link2 />{t("selectionTools.addConnector")}</Button>
    </fieldset> : <p className="text-xs text-muted-foreground">{t("selectionTools.noTargets")}</p>}
  </FormatSection>;
}

export function AnimationTab({ selected, activeStep, disabled, onSteps }: {
  selected: PresentationElement; activeStep: PresentationStep | null; disabled: boolean;
  onSteps: (update: (steps: PresentationStep[]) => PresentationStep[]) => void;
}) {
  const studio = useTranslations("presentationStudio");
  const t = useTranslations("wiki.presentations");
  const step = activeStep?.elementId === selected.id ? activeStep : null;
  const addStep = (action: "fadeIn" | "fadeOut") => onSteps((steps) => {
    if (steps.length >= 500) return steps;
    const at = activeStep ? steps.findIndex((candidate) => candidate.id === activeStep.id) + 1 : steps.length;
    const next = [...steps]; next.splice(at, 0, { id: createId(), elementId: selected.id, action, animationMs: 300 });
    return next;
  });
  return <fieldset disabled={disabled}>
    <FormatSection title={studio("animation")} open testId="properties-animation">
      <p className="text-xs text-muted-foreground">{studio("animationHint")}</p>
      <div className="grid grid-cols-2 gap-1">{(["fadeIn", "fadeOut"] as const).map((action) =>
        <Button key={action} type="button" size="sm" variant="outline" onClick={() => addStep(action)}>{studio(action)}</Button>)}</div>
    </FormatSection>
    {step && <FormatSection title={t("properties.sections.currentStep")} open>
      <SelectField label={studio("stepAction")} value={step.action ?? "camera"} options={(["camera", "fadeIn", "fadeOut"] as const).map((action) => ({ value: action, label: studio(action) }))}
        onChange={(action) => onSteps((steps) => steps.map((candidate) => candidate.id === step.id ? { ...candidate, action } : candidate))} />
      <NumberField label={studio("animationDuration")} value={step.animationMs ?? 300} min={0} max={5000} step={100} unit="ms"
        onChange={(animationMs) => onSteps((steps) => steps.map((candidate) => candidate.id === step.id ? { ...candidate, animationMs: Math.round(animationMs) } : candidate))} />
    </FormatSection>}
  </fieldset>;
}

/** Several objects: align, distribute, group and connect them -- the reason they were selected together. */
export function ArrangeTab({ count, rootCount, disabled, arrangeDisabled, run, commands, onArrange, onConnectPair }: {
  count: number; rootCount: number; disabled: boolean; arrangeDisabled: boolean;
  run: (id: string) => void; commands: Set<string>;
  onArrange: (mode: PresentationAlignment) => void; onConnectPair?: () => void;
}) {
  const t = useTranslations("wiki.presentations");
  const align = presentationAlignments.filter((mode) => mode !== "horizontal" && mode !== "vertical");
  const button = (mode: PresentationAlignment) => { const Icon = ARRANGE_ICONS[mode]; const needs = mode === "horizontal" || mode === "vertical" ? 3 : 2;
    return <Button key={mode} type="button" size="icon-sm" variant="outline" aria-label={t(`layout.${mode}`)} title={t(`layout.${mode}`)}
      disabled={disabled || arrangeDisabled || rootCount < needs} onClick={() => onArrange(mode)}><Icon /></Button>; };
  return <div>
    <FormatSection title={t("properties.sections.align")} open testId="properties-align">
      <div role="group" aria-label={t("properties.sections.align")} className="grid grid-cols-6 gap-1">{align.map(button)}</div>
      <div role="group" aria-label={t("properties.sections.distribute")} className="flex items-center gap-1">
        {button("horizontal")}{button("vertical")}
        <span className="text-xs text-muted-foreground">{rootCount < 3 ? t("properties.distributeHint") : t("properties.sections.distribute")}</span>
      </div>
    </FormatSection>
    <FormatSection title={t("properties.sections.group")} open>
      <div className="grid grid-cols-2 gap-1">
        <Button type="button" size="sm" variant="outline" className="text-xs" disabled={disabled || !commands.has("group")} onClick={() => run("group")}><Group />{t("interactions.group")}</Button>
        <Button type="button" size="sm" variant="outline" className="text-xs" disabled={disabled || !commands.has("ungroup")} onClick={() => run("ungroup")}><Ungroup />{t("interactions.ungroup")}</Button>
      </div>
      {onConnectPair && count === 2 && <Button type="button" size="sm" variant="outline" className="w-full text-xs" disabled={disabled || arrangeDisabled} onClick={onConnectPair}><Link2 />{t("layout.connect")}</Button>}
    </FormatSection>
  </div>;
}
