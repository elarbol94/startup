"use client";
// The small controls PowerPoint's Format pane is built from: collapsible sections, labelled
// rows, number spinners with a unit, transparency sliders and selects. Used by the format-pane tabs.
import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { DraftInput } from "../draft-fields";

/** A pane section with a disclosure triangle, collapsed unless `open` (PowerPoint keeps Fill and Line open). */
export function FormatSection({ title, open = false, children, testId }: { title: string; open?: boolean; children: ReactNode; testId?: string }) {
  const [expanded, setExpanded] = useState(open);
  return <section className="border-b py-1.5" data-testid={testId}>
    <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} className="flex w-full items-center gap-1 py-1 text-left text-sm font-semibold">
      <ChevronRight className={cn("size-3.5 transition-transform", expanded && "rotate-90")} />{title}
    </button>
    {expanded && <div className="space-y-2 pt-1 pb-2 pl-4">{children}</div>}
  </section>;
}

/** Label on the left, control on the right, like every row of the pane. */
export function FormatRow({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex items-center justify-between gap-2 text-xs">
    <span className="min-w-0 flex-1 truncate text-muted-foreground">{label}</span>
    <div className="flex shrink-0 items-center gap-1">{children}</div>
  </div>;
}

/** A number with its unit ("1.5 pt", "90°", "50 %"), committed on Enter or blur and clamped. */
export function NumberField({ label, value, onChange, min, max, step = 1, unit, disabled, ariaLabel }: {
  label: string; value: number; onChange: (value: number) => void; min: number; max: number; step?: number; unit?: string; disabled?: boolean;
  /** A fuller name for assistive technology where the visible label repeats elsewhere ("Breite"). */
  ariaLabel?: string;
}) {
  const shown = Math.round(value * 100) / 100;
  return <FormatRow label={label}>
    <DraftInput aria-label={ariaLabel ?? label} type="number" inputMode="decimal" step={step} min={min} max={max} disabled={disabled} className="h-7 w-20 px-1.5 text-right text-xs" value={String(shown)}
      normalise={(raw) => { const n = Number(raw.replace(",", ".")); return String(Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : shown); }}
      onCommit={(next) => onChange(Number(next))} />
    {unit && <span className="w-5 text-muted-foreground">{unit}</span>}
  </FormatRow>;
}

/** Transparency and similar shares: a slider plus a percent field, as in the pane. */
export function PercentField({ label, value, onChange, disabled }: { label: string; value: number; onChange: (value: number) => void; disabled?: boolean }) {
  return <div className="space-y-1">
    <NumberField label={label} value={value * 100} min={0} max={100} unit="%" onChange={(next) => onChange(next / 100)} disabled={disabled} />
    <input type="range" aria-label={label} min={0} max={100} step={1} value={Math.round(value * 100)} disabled={disabled} className="w-full" onChange={(event) => onChange(Number(event.target.value) / 100)} />
  </div>;
}

export function SelectField<T extends string>({ label, value, options, onChange, disabled, testId }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; disabled?: boolean; testId?: string;
}) {
  return <FormatRow label={label}>
    <select aria-label={label} data-testid={testId} disabled={disabled} className="h-7 max-w-36 rounded-md border bg-background px-1.5 text-xs" value={value} onChange={(event) => onChange(event.target.value as T)}>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </FormatRow>;
}

/** A radio group laid out vertically, like the pane's "No fill / Solid fill / …". */
export function RadioList<T extends string>({ name, value, options, onChange, disabled }: { name: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; disabled?: boolean }) {
  return <div role="radiogroup" className="space-y-1">
    {options.map((option) => <label key={option.value} className="flex items-center gap-2 text-xs">
      <input type="radio" name={name} checked={value === option.value} disabled={disabled} onChange={() => onChange(option.value)} />{option.label}
    </label>)}
  </div>;
}

export function CheckField({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}
