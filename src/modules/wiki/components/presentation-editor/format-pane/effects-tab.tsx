"use client";
// Format Shape → Effects: Shadow, Reflection, Glow, Soft Edges, 3-D Format (bevel) and 3-D
// Rotation, each with PowerPoint's presets and parameters. Also used for WordArt text effects.
import { useTranslations } from "next-intl";
import { bevelPresets, type PresentationEffects } from "../../../lib/presentation-format-model";
import { FormatRow, FormatSection, NumberField, PercentField, SelectField } from "./format-controls";
import { ThemeColorPicker } from "./theme-color-picker";

type Shadow = NonNullable<PresentationEffects["shadow"]>;
/** The pane's shadow presets: none, nine outer offsets, nine inner, and the perspective ones. */
const OUTER = [[225, "topLeft"], [270, "top"], [315, "topRight"], [180, "left"], [0, "center"], [0, "right"], [135, "bottomLeft"], [90, "bottom"], [45, "bottomRight"]] as const;
export const SHADOW_PRESETS: { id: string; shadow?: Shadow }[] = [
  { id: "none" },
  ...OUTER.map(([angle, id]) => ({ id: `outer-${id}`, shadow: { type: "outer" as const, color: "#000000", transparency: 0.57, size: id === "center" ? 102 : 100, blur: 4, angle, distance: id === "center" ? 0 : 3 } })),
  ...OUTER.map(([angle, id]) => ({ id: `inner-${id}`, shadow: { type: "inner" as const, color: "#000000", transparency: 0.5, size: 100, blur: 5, angle, distance: id === "center" ? 0 : 4 } })),
  ...([["perspectiveUpperLeft", 225], ["perspectiveUpperRight", 315], ["perspectiveBelow", 90], ["perspectiveLowerLeft", 135], ["perspectiveLowerRight", 45]] as const).map(([id, angle]) => ({ id, shadow: { type: "perspective" as const, color: "#000000", transparency: 0.8, size: 100, blur: 6, angle, distance: 10 } })),
];
const GLOW_SIZES = [5, 8, 11, 18];
const SOFT_EDGES = [0, 1, 2.5, 5, 10, 25, 50];
const REFLECTIONS: { id: string; reflection?: NonNullable<PresentationEffects["reflection"]> }[] = [
  { id: "none" },
  ...([["tight", 40], ["half", 50], ["full", 100]] as const).flatMap(([size, share]) => ([["touching", 0], ["offset4", 4], ["offset8", 8]] as const)
    .map(([gap, distance]) => ({ id: `${size}-${gap}`, reflection: { transparency: 0.5, size: share, blur: 0.5, distance } }))),
];

export function EffectsEditor({ effects, onChange, disabled, onEyedropper, text = false }: {
  effects: PresentationEffects | undefined; onChange: (effects: PresentationEffects | undefined) => void; disabled?: boolean;
  onEyedropper?: () => Promise<string | null>; text?: boolean;
}) {
  const t = useTranslations("wiki.presentations.formatPane.effects");
  const tc = useTranslations("wiki.presentations.formatPane");
  const e = effects ?? {};
  const put = <K extends keyof PresentationEffects>(key: K, value: PresentationEffects[K] | undefined) => {
    const next = { ...e, [key]: value };
    if (value === undefined) delete next[key];
    onChange(Object.keys(next).length ? next : undefined);
  };
  const shadowPreset = SHADOW_PRESETS.find((p) => p.shadow && e.shadow && p.shadow.type === e.shadow.type && p.shadow.angle === e.shadow.angle && p.shadow.distance === e.shadow.distance)?.id ?? (e.shadow ? "custom" : "none");
  return <div>
    <FormatSection title={t("shadow")} open={Boolean(e.shadow)} testId="format-shadow">
      <SelectField label={t("presets")} value={shadowPreset} disabled={disabled} testId="format-shadow-preset"
        options={[...SHADOW_PRESETS.map((p) => ({ value: p.id, label: t(`shadowPresets.${p.id}`) })), ...(shadowPreset === "custom" ? [{ value: "custom", label: t("custom") }] : [])]}
        onChange={(id) => { if (id !== "custom") put("shadow", SHADOW_PRESETS.find((p) => p.id === id)?.shadow); }} />
      {e.shadow && (() => {
        const s = e.shadow, set = (patch: Partial<Shadow>) => put("shadow", { ...s, ...patch });
        return <>
          <FormatRow label={tc("color")}><ThemeColorPicker label={t("shadowColor")} value={s.color} onChange={(color) => set({ color: color || "#000000" })} onEyedropper={onEyedropper} disabled={disabled} /></FormatRow>
          <PercentField label={tc("transparency")} value={s.transparency} onChange={(transparency) => set({ transparency })} disabled={disabled} />
          {!text && <NumberField label={t("size")} value={s.size} min={1} max={200} unit="%" onChange={(size) => set({ size })} disabled={disabled} />}
          <NumberField label={t("blur")} value={s.blur} min={0} max={100} unit="pt" onChange={(blur) => set({ blur })} disabled={disabled} />
          <NumberField label={t("angle")} value={s.angle} min={0} max={359.9} unit="°" onChange={(angle) => set({ angle })} disabled={disabled} />
          <NumberField label={t("distance")} value={s.distance} min={0} max={200} unit="pt" onChange={(distance) => set({ distance })} disabled={disabled} />
        </>;
      })()}
    </FormatSection>
    <FormatSection title={t("reflection")} open={Boolean(e.reflection)} testId="format-reflection">
      <SelectField label={t("presets")} value={REFLECTIONS.find((r) => r.reflection && e.reflection && r.reflection.size === e.reflection.size && r.reflection.distance === e.reflection.distance)?.id ?? (e.reflection ? "custom" : "none")} disabled={disabled}
        options={[...REFLECTIONS.map((r) => ({ value: r.id, label: t(`reflectionPresets.${r.id}`) })), ...(e.reflection && !REFLECTIONS.some((r) => r.reflection?.size === e.reflection?.size && r.reflection?.distance === e.reflection?.distance) ? [{ value: "custom", label: t("custom") }] : [])]}
        onChange={(id) => { if (id !== "custom") put("reflection", REFLECTIONS.find((r) => r.id === id)?.reflection); }} />
      {e.reflection && (() => {
        const r = e.reflection, set = (patch: Partial<typeof r>) => put("reflection", { ...r, ...patch });
        return <>
          <PercentField label={tc("transparency")} value={r.transparency} onChange={(transparency) => set({ transparency })} disabled={disabled} />
          <NumberField label={t("size")} value={r.size} min={0} max={100} unit="%" onChange={(size) => set({ size })} disabled={disabled} />
          <NumberField label={t("blur")} value={r.blur} min={0} max={100} unit="pt" onChange={(blur) => set({ blur })} disabled={disabled} />
          <NumberField label={t("distance")} value={r.distance} min={0} max={100} unit="pt" onChange={(distance) => set({ distance })} disabled={disabled} />
        </>;
      })()}
    </FormatSection>
    <FormatSection title={t("glow")} open={Boolean(e.glow)} testId="format-glow">
      <SelectField label={t("presets")} value={e.glow ? (GLOW_SIZES.includes(e.glow.size) ? String(e.glow.size) : "custom") : "none"} disabled={disabled}
        options={[{ value: "none", label: t("noGlow") }, ...GLOW_SIZES.map((size) => ({ value: String(size), label: t("glowSize", { size }) })), ...(e.glow && !GLOW_SIZES.includes(e.glow.size) ? [{ value: "custom", label: t("custom") }] : [])]}
        onChange={(id) => { if (id === "custom") return; put("glow", id === "none" ? undefined : { color: e.glow?.color ?? "#156082", transparency: e.glow?.transparency ?? 0.4, size: Number(id) }); }} />
      {e.glow && (() => {
        const g = e.glow, set = (patch: Partial<typeof g>) => put("glow", { ...g, ...patch });
        return <>
          <FormatRow label={tc("color")}><ThemeColorPicker label={t("glowColor")} value={g.color} onChange={(color) => set({ color: color || "#156082" })} onEyedropper={onEyedropper} disabled={disabled} /></FormatRow>
          <NumberField label={t("size")} value={g.size} min={0} max={150} unit="pt" onChange={(size) => set({ size })} disabled={disabled} />
          <PercentField label={tc("transparency")} value={g.transparency} onChange={(transparency) => set({ transparency })} disabled={disabled} />
        </>;
      })()}
    </FormatSection>
    {!text && <FormatSection title={t("softEdges")} open={Boolean(e.softEdges)} testId="format-soft-edges">
      <SelectField label={t("presets")} value={SOFT_EDGES.includes(e.softEdges ?? 0) ? String(e.softEdges ?? 0) : "custom"} disabled={disabled}
        options={[...SOFT_EDGES.map((size) => ({ value: String(size), label: size ? t("softEdgeSize", { size }) : t("noSoftEdges") })), ...(!SOFT_EDGES.includes(e.softEdges ?? 0) ? [{ value: "custom", label: t("custom") }] : [])]}
        onChange={(id) => { if (id !== "custom") put("softEdges", Number(id) || undefined); }} />
      <NumberField label={t("size")} value={e.softEdges ?? 0} min={0} max={100} unit="pt" onChange={(size) => put("softEdges", size || undefined)} disabled={disabled} />
    </FormatSection>}
    <FormatSection title={t("format3d")} open={Boolean(e.bevel)} testId="format-3d">
      <SelectField label={t("topBevel")} value={e.bevel?.preset ?? "none"} disabled={disabled}
        options={[{ value: "none", label: t("bevels.none") }, ...bevelPresets.map((value) => ({ value, label: t(`bevels.${value}`) }))]}
        onChange={(preset) => put("bevel", preset === "none" ? undefined : { preset, width: e.bevel?.width ?? 6, height: e.bevel?.height ?? 6 })} />
      {e.bevel && <>
        <NumberField label={t("bevelWidth")} ariaLabel={t("bevelWidthLabel")} value={e.bevel.width} min={0} max={100} unit="pt" onChange={(width) => put("bevel", { ...e.bevel!, width })} disabled={disabled} />
        <NumberField label={t("bevelHeight")} ariaLabel={t("bevelHeightLabel")} value={e.bevel.height} min={0} max={100} unit="pt" onChange={(height) => put("bevel", { ...e.bevel!, height })} disabled={disabled} />
      </>}
    </FormatSection>
    {!text && <FormatSection title={t("rotation3d")} open={Boolean(e.rotation3d)} testId="format-3d-rotation">
      {(["x", "y", "z"] as const).map((axis) => <NumberField key={axis} label={t(`rotation.${axis}`)} value={e.rotation3d?.[axis] ?? 0} min={0} max={359.9} unit="°" disabled={disabled}
        onChange={(value) => { const r = { x: 0, y: 0, z: 0, perspective: 0, ...e.rotation3d, [axis]: value }; put("rotation3d", r.x || r.y || r.z ? r : undefined); }} />)}
      <NumberField label={t("perspective")} value={e.rotation3d?.perspective ?? 0} min={0} max={120} unit="°" disabled={disabled || !e.rotation3d}
        onChange={(perspective) => e.rotation3d && put("rotation3d", { ...e.rotation3d, perspective })} />
    </FormatSection>}
  </div>;
}
