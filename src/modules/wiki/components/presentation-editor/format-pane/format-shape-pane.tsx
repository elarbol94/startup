"use client";
// The Format Shape pane (Ctrl+1 / "Format Shape…"): Shape Options with Fill & Line and Effects,
// and Text Options with Text Fill & Outline, Text Effects and Textbox, as in PowerPoint. Size
// & Properties stays in the editor's precision controls above the pane.
import { useState } from "react";
import { useTranslations } from "next-intl";
import { PaintBucket, Pentagon, Type, Sparkles, TextCursorInput } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PresentationElement } from "../../../lib/presentation";
import { isTextHost } from "../../../lib/presentation-text-host";
import type { TextFormatApi } from "../use-text-format";
import { EffectsEditor } from "./effects-tab";
import { FillLineTab } from "./fill-line-tab";
import { TextBoxTab, TextFillTab } from "./text-options-tab";

type Shape = Extract<PresentationElement, { type: "shape" }>;
type TextHost = Extract<PresentationElement, { type: "text" | "shape" }>;
type Tab = "fillLine" | "effects" | "textFill" | "textEffects" | "textBox";

export function FormatShapePane({ element, updateContent, format, disabled, onEyedropper, uploadPicture, initialTab }: {
  element: TextHost;
  /** Replaces the element's content in one undo step. */
  updateContent: (id: string, change: (content: TextHost["content"]) => TextHost["content"]) => void;
  format: TextFormatApi | null; disabled?: boolean;
  onEyedropper?: () => Promise<string | null>; uploadPicture?: (file: File) => Promise<string | null>;
  initialTab?: "shape" | "text";
}) {
  const t = useTranslations("wiki.presentations.formatPane");
  const shape = element.type === "shape" ? element : null;
  const hasText = isTextHost(element);
  const [group, setGroup] = useState<"shape" | "text">(initialTab ?? (shape ? "shape" : "text"));
  const [tabs, setTabs] = useState<{ shape: Tab; text: Tab }>({ shape: "fillLine", text: "textBox" });
  const active = !shape ? "text" : !hasText ? "shape" : group;
  const tab = tabs[active];
  const setShape = (change: (content: Shape["content"]) => Shape["content"]) => updateContent(element.id, (content) => change(content as Shape["content"]));
  const setText = (change: (content: TextHost["content"]) => TextHost["content"]) => updateContent(element.id, change);
  const icons: { id: Tab; label: string; icon: React.ReactNode }[] = active === "shape"
    ? [{ id: "fillLine", label: t("tabs.fillLine"), icon: <PaintBucket className="size-4" /> }, { id: "effects", label: t("tabs.effects"), icon: <Pentagon className="size-4" /> }]
    : [{ id: "textFill", label: t("tabs.textFill"), icon: <Type className="size-4" /> }, { id: "textEffects", label: t("tabs.textEffects"), icon: <Sparkles className="size-4" /> }, { id: "textBox", label: t("tabs.textBox"), icon: <TextCursorInput className="size-4" /> }];
  return <section aria-label={t("title")} data-testid="format-shape-pane" className="mt-3 rounded-lg border p-3">
    <h2 className="mb-2 text-sm font-semibold">{shape ? t("title") : t("titleText")}</h2>
    {shape && hasText && <div role="tablist" className="mb-2 flex gap-3 border-b text-xs">
      {(["shape", "text"] as const).map((id) => <button key={id} type="button" role="tab" aria-selected={active === id} onClick={() => setGroup(id)}
        className={cn("-mb-px border-b-2 pb-1", active === id ? "border-amber-600 font-semibold" : "border-transparent text-muted-foreground")}>{t(`groups.${id}`)}</button>)}
    </div>}
    <div role="tablist" className="mb-1 flex gap-1">
      {icons.map((entry) => <button key={entry.id} type="button" role="tab" title={entry.label} aria-label={entry.label} aria-selected={tab === entry.id} data-testid={`format-tab-${entry.id}`}
        onClick={() => setTabs((current) => ({ ...current, [active]: entry.id }))}
        className={cn("rounded-md p-1.5", tab === entry.id ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" : "hover:bg-muted")}>{entry.icon}</button>)}
    </div>
    <fieldset disabled={disabled} className="min-w-0">
      {shape && tab === "fillLine" && <FillLineTab element={shape} set={setShape} disabled={disabled} onEyedropper={onEyedropper} uploadPicture={uploadPicture} />}
      {shape && tab === "effects" && <EffectsEditor effects={shape.content.effects} disabled={disabled} onEyedropper={onEyedropper} onChange={(effects) => setShape((c) => ({ ...c, effects }))} />}
      {active === "text" && tab === "textFill" && <TextFillTab element={element} set={setText} disabled={disabled} onEyedropper={onEyedropper} />}
      {active === "text" && tab === "textEffects" && <EffectsEditor text effects={element.content.textStyle?.effects} disabled={disabled} onEyedropper={onEyedropper}
        onChange={(effects) => setText((c) => ({ ...c, textStyle: { ...c.textStyle, effects: effects as NonNullable<TextHost["content"]["textStyle"]>["effects"], wordArt: undefined } }))} />}
      {active === "text" && tab === "textBox" && <TextBoxTab element={element} set={setText} format={format} disabled={disabled} />}
    </fieldset>
  </section>;
}
