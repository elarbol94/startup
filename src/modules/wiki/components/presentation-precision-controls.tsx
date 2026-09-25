"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { canEditGeometry, containingPresentationFrame, frameAlignments, precisionFields, type GeometryField } from "../lib/presentation-precision";
import { layoutRoots, type PresentationAlignment } from "../lib/presentation-layout";
import { normalizeRotation, type PresentationElement } from "../lib/presentation";
import { framePresetHeight, isSectionFrame, presentationFramePresets } from "../lib/presentation-frames";

function GeometryInput({ value, field, label, onCommit }: {
  value: number; field: GeometryField; label: string; onCommit: (value: number) => boolean;
}) {
  const t = useTranslations("wiki.presentations.precision");
  const inputId = useId();
  const [draft, setDraft] = useState(String(value));
  const [synced, setSynced] = useState(value);
  const [error, setError] = useState(false);
  if (synced !== value) { setSynced(value); setDraft(String(value)); setError(false); }
  const size = field === "width" || field === "height";
  const commit = () => {
    const raw = draft.trim();
    const number = Number(raw);
    const valid = raw !== "" && Number.isFinite(number)
      && (!size || (number >= 20 && number <= 20_000))
      && (field !== "rotation" || (number >= -360 && number <= 360));
    const accepted = valid && (number === value || onCommit(number));
    setError(!accepted);
    setDraft(String(accepted ? field === "rotation" ? normalizeRotation(number) : number : value));
  };
  return <div className="min-w-0 text-xs text-muted-foreground">
    <label htmlFor={inputId}>{label}</label>
    <Input id={inputId} aria-describedby={error ? `${inputId}-error` : undefined} type="number" step="any" min={size ? 20 : field === "rotation" ? -360 : undefined} max={size ? 20_000 : field === "rotation" ? 360 : undefined} value={draft} inputMode="decimal" className="mt-1 h-8" aria-invalid={error}
      onChange={event => { setDraft(event.target.value); setError(false); }} onBlur={commit}
      onKeyDown={event => {
        if (event.key === "Enter") { event.preventDefault(); commit(); }
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setDraft(String(value)); setError(false); }
      }} />
    {error && <span id={`${inputId}-error`} role="alert" className="mt-1 block text-destructive">{t("invalid")}</span>}
  </div>;
}

export function PresentationPrecisionControls({ elements, selection, disabled, onGeometry, onAlign }: {
  elements: PresentationElement[]; selection: PresentationElement[]; disabled: boolean;
  onGeometry: (id: string, field: GeometryField, value: number, proportional: boolean) => boolean;
  onAlign: (mode: PresentationAlignment) => void;
}) {
  const t = useTranslations("wiki.presentations");
  const [proportional, setProportional] = useState(false);
  const selected = selection.length === 1 ? selection[0] : undefined;
  const ids = new Set(selection.map(e => e.id));
  const roots = layoutRoots(elements, ids);
  const frame = containingPresentationFrame(elements, ids);
  const locked = disabled || roots.some(e => !canEditGeometry(elements, e));
  if (!selected && !frame) return null;
  return <section aria-label={t("precision.title")} className="my-3 space-y-3 rounded-lg border p-3">
    <h2 className="text-sm font-semibold">{t("precision.title")}</h2>
    {selected && <fieldset disabled={locked} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {precisionFields.map(field => <GeometryInput key={`${selected.id}-${field}`} field={field} label={t(`precision.${field}`)} value={selected[field]}
          onCommit={value => onGeometry(selected.id, field, value, proportional)} />)}
      </div>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={proportional} onChange={event => setProportional(event.target.checked)} />{t("precision.proportional")}</label>
      {isSectionFrame(selected) && <div role="group" aria-label={t("precision.aspect")} className="flex items-center gap-1">
        <span className="mr-auto text-xs text-muted-foreground">{t("precision.aspect")}</span>
        {presentationFramePresets.map(([preset]) => <Button key={preset} type="button" size="xs" variant="outline" aria-label={t("precision.aspectPreset", { preset })}
          onClick={() => onGeometry(selected.id, "height", framePresetHeight(selected.width, preset), false)}>{preset}</Button>)}
      </div>}
      <p className="text-xs text-muted-foreground">{t("precision.units")}</p>
    </fieldset>}
    {frame && <fieldset disabled={locked} className="space-y-2">
      <legend className="mb-2 text-xs font-medium">{t("precision.alignFrame")}</legend>
      <div className="grid grid-cols-2 gap-2">{frameAlignments.map(mode => <Button key={mode} type="button" size="sm" variant="outline" className="h-auto min-h-8 whitespace-normal text-xs" onClick={() => onAlign(mode)}>{t(`layout.${mode}`)}</Button>)}</div>
    </fieldset>}
  </section>;
}
