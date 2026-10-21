"use client";
// PowerPoint's View → Grid and Guides dialog for the presentation canvas: snap to grid, grid
// spacing (the dialog's list or a custom value in cm), and showing grid, drawing and smart
// guides. Changes apply immediately. Used by presentation-editor.tsx.
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PRESENTATION_CM, gridSpacingChoice, gridSpacingChoices } from "../../lib/presentation-grid";
import type { PresentationSettings } from "../../lib/presentation";
import { DraftInput } from "./draft-fields";

type ViewSettings = Pick<PresentationSettings, "grid" | "guides">;

const centimetres = (spacing: number) => String(Math.round((spacing / PRESENTATION_CM) * 100) / 100);

export function GridGuidesDialog({ open, onOpenChange, settings, update, toggleGuides, disabled = false }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: ViewSettings;
  /** Shallow-merged into the settings, so each call carries a complete `grid` / `guides`. */
  update: (partial: Partial<ViewSettings>) => void;
  /** The view hook's toggle, so the first "show" adds guides through the centre like PowerPoint. */
  toggleGuides?: () => void;
  disabled?: boolean;
}) {
  const t = useTranslations("wiki");
  const { grid, guides } = settings;
  const choice = gridSpacingChoice(grid.spacing);
  // "Custom" stays chosen while its value happens to equal a list entry.
  const [custom, setCustom] = useState(false);
  const selected = custom || !choice ? "custom" : choice.key;
  const check = (label: string, checked: boolean, change: (checked: boolean) => void) => (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox checked={checked} onCheckedChange={value => change(value === true)} />
      {label}
    </label>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>{t("presentations.gridGuides.title")}</DialogTitle></DialogHeader>
        <fieldset disabled={disabled} className="space-y-5">
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground">{t("presentations.gridGuides.snapTo")}</h3>
            {check(t("presentations.gridGuides.snapToGrid"), grid.snap, snap => update({ grid: { ...grid, snap } }))}
          </section>
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground">{t("presentations.gridGuides.gridSettings")}</h3>
            <div className="flex flex-wrap items-end gap-2">
              <label className="block min-w-40 flex-1 text-xs text-muted-foreground">
                {t("presentations.gridGuides.spacing")}
                <select
                  data-testid="presentation-grid-spacing"
                  className="mt-1 h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm text-foreground outline-none dark:bg-input/30"
                  value={selected}
                  onChange={event => {
                    const next = gridSpacingChoices.find(c => c.key === event.target.value);
                    setCustom(!next);
                    if (next) update({ grid: { ...grid, spacing: next.spacing } });
                  }}
                >
                  {gridSpacingChoices.map(c => (
                    <option key={c.key} value={c.key}>
                      {c.perCm ? t("presentations.gridGuides.perCm", { count: c.perCm }) : t("presentations.gridGuides.cm", { count: c.cm ?? 1 })}
                    </option>
                  ))}
                  <option value="custom">{t("presentations.gridGuides.custom")}</option>
                </select>
              </label>
              {selected === "custom" && (
                <label className="block w-28 text-xs text-muted-foreground">
                  {t("presentations.gridGuides.customSpacing")}
                  <DraftInput
                    type="number"
                    min={0.05}
                    max={35}
                    step={0.01}
                    className="mt-1 h-8"
                    value={centimetres(grid.spacing)}
                    normalise={raw => {
                      const cm = Number(raw.replace(",", "."));
                      return Number.isFinite(cm) && cm > 0 ? centimetres(Math.min(Math.max(cm * PRESENTATION_CM, 1), 1000)) : centimetres(grid.spacing);
                    }}
                    onCommit={next => update({ grid: { ...grid, spacing: Math.min(Math.max(Number(next) * PRESENTATION_CM, 1), 1000) } })}
                  />
                </label>
              )}
            </div>
            {check(t("presentations.gridGuides.showGrid"), grid.show, show => update({ grid: { ...grid, show } }))}
            <label className="block text-xs text-muted-foreground">
              {t("presentations.gridGuides.transparency", { percent: Math.round(grid.transparency * 100) })}
              <input
                type="range"
                data-testid="presentation-grid-transparency"
                min={0}
                max={100}
                step={5}
                className="mt-1 w-full accent-primary"
                value={Math.round(grid.transparency * 100)}
                onChange={event => update({ grid: { ...grid, transparency: Number(event.target.value) / 100 } })}
              />
            </label>
          </section>
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground">{t("presentations.gridGuides.guideSettings")}</h3>
            {check(t("presentations.gridGuides.showGuides"), guides.show, show => toggleGuides ? toggleGuides() : update({ guides: { ...guides, show } }))}
            {check(t("presentations.gridGuides.showSmart"), guides.smart, smart => update({ guides: { ...guides, smart } }))}
          </section>
        </fieldset>
      </DialogContent>
    </Dialog>
  );
}
