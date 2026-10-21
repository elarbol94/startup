"use client";
// "Größe und Position", as in PowerPoint's Format pane: Size (height, width, rotation, lock
// aspect ratio, a frame's aspect presets), Position, alignment inside the surrounding frame,
// and where the object sits -- its frame and its layer.
import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignStartHorizontal, AlignStartVertical, ArrowDown, ArrowUp, BringToFront, SendToBack } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { presentationDescendants, isPresentationElementLocked, normalizeRotation, type PresentationElement } from "../../../lib/presentation";
import { canEditGeometry, containingPresentationFrame, formatGeometryValue, frameAlignments, type GeometryField } from "../../../lib/presentation-precision";
import { layoutRoots, type PresentationAlignment } from "../../../lib/presentation-layout";
import { framePresetHeight, isSectionFrame, presentationFramePresets } from "../../../lib/presentation-frames";
import { CheckField, FormatRow, FormatSection } from "../format-pane/format-controls";

const ALIGN_ICONS: Partial<Record<PresentationAlignment, typeof AlignStartVertical>> = {
  left: AlignStartVertical, center: AlignCenterVertical, right: AlignEndVertical, top: AlignStartHorizontal, middle: AlignCenterHorizontal, bottom: AlignEndHorizontal,
};

/** A geometry value committed on Enter or blur; an untouched field never moves the object. */
function GeometryInput({ value, field, label, unit, hint, onCommit }: {
  value: number; field: GeometryField; label: string; unit: string; hint: string; onCommit: (value: number) => boolean;
}) {
  const t = useTranslations("wiki.presentations.precision");
  const inputId = useId();
  // Position and size are rounded for display; rotation keeps what the author typed.
  const shown = field === "rotation" ? String(value) : formatGeometryValue(value);
  const [draft, setDraft] = useState(shown);
  const [synced, setSynced] = useState(value);
  const [error, setError] = useState(false);
  const [edited, setEdited] = useState(false);
  if (synced !== value) { setSynced(value); setDraft(shown); setError(false); setEdited(false); }
  const size = field === "width" || field === "height";
  const commit = () => {
    const raw = draft.trim().replace(",", ".");
    // An untouched field shows a rounded value; committing it would move the element.
    if (!edited || raw === shown) { setError(false); setDraft(shown); setEdited(false); return; }
    setEdited(false);
    const number = Number(raw);
    const valid = raw !== "" && Number.isFinite(number)
      && (!size || (number >= 20 && number <= 20_000))
      && (field !== "rotation" || (number >= -360 && number <= 360));
    const accepted = valid && (number === value || onCommit(number));
    setError(!accepted);
    setDraft(accepted ? field === "rotation" ? String(normalizeRotation(number)) : formatGeometryValue(number) : shown);
  };
  return <div className="text-xs">
    <div className="flex items-center justify-between gap-2">
      <label htmlFor={inputId} className="min-w-0 flex-1 truncate text-muted-foreground">{label}</label>
      <Input id={inputId} aria-describedby={error ? `${inputId}-error` : undefined} type="number" step="any" min={size ? 20 : field === "rotation" ? -360 : undefined} max={size ? 20_000 : field === "rotation" ? 360 : undefined}
        value={draft} inputMode="decimal" title={hint} className="h-7 w-24 px-1.5 text-right text-xs" aria-invalid={error}
        onChange={(event) => { setDraft(event.target.value); setError(false); setEdited(true); }} onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") { event.preventDefault(); commit(); }
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setDraft(shown); setError(false); setEdited(false); }
          // Up/Down step by 1, Shift by 10 -- and apply at once, like PowerPoint's spinners.
          if ((event.key === "ArrowUp" || event.key === "ArrowDown") && !error) {
            event.preventDefault();
            const step = (event.shiftKey ? 10 : 1) * (event.key === "ArrowUp" ? 1 : -1);
            const next = Number(draft.replace(",", ".")) + step;
            if (Number.isFinite(next) && (!size || (next >= 20 && next <= 20_000)) && onCommit(next)) { setDraft(formatGeometryValue(next)); setEdited(false); }
          }
        }} />
      <span className="w-4 text-muted-foreground">{unit}</span>
    </div>
    {error && <span id={`${inputId}-error`} role="alert" className="mt-1 block text-destructive">{t("invalid")}</span>}
  </div>;
}

export function LayoutTab({ elements, selected, disabled, onGeometry, onAlign, onParent, onAttachContents, run, commands }: {
  elements: PresentationElement[]; selected: PresentationElement; disabled: boolean;
  onGeometry: (id: string, field: GeometryField, value: number, proportional: boolean) => boolean;
  onAlign: (mode: PresentationAlignment) => void;
  onParent: (parentId: string | undefined) => void;
  onAttachContents: () => void;
  run: (id: string) => void; commands: Set<string>;
}) {
  const t = useTranslations("wiki.presentations");
  const studio = useTranslations("presentationStudio");
  const [proportional, setProportional] = useState(false);
  const ids = new Set([selected.id]);
  const roots = layoutRoots(elements, ids);
  const frame = containingPresentationFrame(elements, ids);
  const geometryLocked = disabled || roots.some((element) => !canEditGeometry(elements, element));
  const locked = isPresentationElementLocked(elements, selected.id);
  const descendants = presentationDescendants(elements, ids);
  const parents = elements.filter((element) => element.type === "frame" && !descendants.has(element.id) && !isPresentationElementLocked(elements, element.id));
  const hint = t("precision.units");
  const geometry = (field: GeometryField, unit = "") => <GeometryInput key={`${selected.id}-${field}`} field={field} label={t(`precision.${field}`)} unit={unit} hint={hint}
    value={selected[field]} onCommit={(value) => onGeometry(selected.id, field, value, proportional)} />;
  return <div>
    <FormatSection title={t("properties.sections.size")} open testId="properties-size">
      <fieldset disabled={geometryLocked} className="space-y-2">
        {geometry("height")}{geometry("width")}{geometry("rotation")}
        <CheckField label={t("precision.proportional")} checked={proportional} onChange={setProportional} />
        {isSectionFrame(selected) && <div role="group" aria-label={t("precision.aspect")} className="flex items-center gap-1">
          <span className="mr-auto text-xs text-muted-foreground">{t("precision.aspect")}</span>
          {presentationFramePresets.map(([preset]) => <Button key={preset} type="button" size="xs" variant="outline" aria-label={t("precision.aspectPreset", { preset })}
            onClick={() => onGeometry(selected.id, "height", framePresetHeight(selected.width, preset), false)}>{preset}</Button>)}
        </div>}
      </fieldset>
    </FormatSection>
    <FormatSection title={t("properties.sections.position")} open testId="properties-position">
      <fieldset disabled={geometryLocked} className="space-y-2">{geometry("x")}{geometry("y")}</fieldset>
    </FormatSection>
    {frame && <FormatSection title={t("precision.alignFrame")} open>
      <div role="group" aria-label={t("precision.alignFrame")} className="grid grid-cols-6 gap-1">
        {frameAlignments.map((mode) => { const Icon = ALIGN_ICONS[mode]; return <Button key={mode} type="button" size="icon-sm" variant="outline" disabled={geometryLocked}
          aria-label={t(`layout.${mode}`)} title={t(`layout.${mode}`)} onClick={() => onAlign(mode)}>{Icon ? <Icon /> : t(`layout.${mode}`)}</Button>; })}
      </div>
    </FormatSection>}
    <FormatSection title={t("properties.sections.arrange")} open testId="properties-arrange">
      <div className="grid grid-cols-2 gap-1">
        {([["front", BringToFront], ["back", SendToBack], ["forward", ArrowUp], ["backward", ArrowDown]] as const).map(([id, Icon]) =>
          <Button key={id} type="button" size="sm" variant="outline" className="justify-start text-xs font-normal" disabled={disabled || !commands.has(id)} onClick={() => run(id)}><Icon />{t(`interactions.${id}`)}</Button>)}
      </div>
      {(selected.parentId || parents.length > 0) && <FormatRow label={studio("parentFrame")}>
        <select aria-label={studio("parentFrame")} className="h-7 max-w-40 rounded-md border bg-background px-1.5 text-xs" value={selected.parentId ?? ""} disabled={disabled || locked}
          onChange={(event) => onParent(event.target.value || undefined)}>
          <option value="">{studio("noParent")}</option>
          {parents.map((element, index) => <option key={element.id} value={element.id}>{element.type === "frame" && element.content.label || `${studio("frame")} ${index + 1}`}</option>)}
        </select>
      </FormatRow>}
      {selected.type === "frame" && !selected.content.isGroup && <Button type="button" size="sm" variant="outline" className="w-full text-xs" disabled={disabled || locked} title={t("properties.attachHint")} onClick={onAttachContents}>{studio("attachContents")}</Button>}
    </FormatSection>
  </div>;
}
