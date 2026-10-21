"use client";
// The Eigenschaften pane, laid out like PowerPoint's Format pane: a header naming the selection
// with its actions, one row of icon tabs that depends on what is selected, and the active tab's
// sections. It opens on the tab that matters for the object (a double-click on a picture shows
// Picture), remembers the tab last used for each kind of object, and follows the ribbon's
// dialog launchers (Format Shape, Text Options).
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChartColumn, Film, Frame, Image as ImageIcon, LayoutGrid, PaintBucket, Pentagon, Scaling, Smile, Sparkles, Type } from "lucide-react";
import { ColorPicker } from "@/components/ui/color-picker";
import { cn } from "@/lib/utils";
import type { useCollaborationContext } from "../../../collaboration/ui";
import { isPresentationElementLocked, type PresentationElement, type PresentationStep } from "../../../lib/presentation";
import type { PresentationAlignment } from "../../../lib/presentation-layout";
import type { GeometryField } from "../../../lib/presentation-precision";
import { EffectsEditor } from "../format-pane/effects-tab";
import { FillLineTab } from "../format-pane/fill-line-tab";
import { FormatRow } from "../format-pane/format-controls";
import type { EditorSearchCommand } from "../../editor-command-search";
import type { usePresentationFormatting } from "../use-presentation-formatting";
import { ChartTab, FrameTab, IconTab, MediaTab, PictureTab, TextTab } from "./content-tabs";
import { LayoutTab } from "./layout-tab";
import { AnimationTab, ArrangeTab, ConnectSection, ShapeSection } from "./object-tabs";
import { lockState, PropertiesHeader } from "./properties-header";
import { chooseTab, propertiesTabs, selectionKind, type PropertiesTab } from "./properties-tabs";

type Shape = Extract<PresentationElement, { type: "shape" }>;
type Update = (id: string, update: (element: PresentationElement) => PresentationElement) => void;

const TAB_ICONS: Record<PropertiesTab, typeof Type> = {
  fill: PaintBucket, effects: Pentagon, text: Type, picture: ImageIcon, chart: ChartColumn, icon: Smile, media: Film, frame: Frame, arrange: LayoutGrid, layout: Scaling, animation: Sparkles,
};

/** A request to show a tab: "primary" is the object's own first tab (a double-click). */
export type PropertiesRequest = { tab: PropertiesTab | "primary"; key: number };

export function PresentationPropertiesPane(props: {
  elements: PresentationElement[]; selection: PresentationElement[]; disabled: boolean;
  collaboration: ReturnType<typeof useCollaborationContext>;
  formatting: ReturnType<typeof usePresentationFormatting>;
  request: PropertiesRequest;
  run: (id: string) => void; commands: EditorSearchCommand[];
  updateElement: Update;
  onTextChange: (id: string, text: string) => void;
  onRichTextChange: (id: string, content: Extract<PresentationElement, { type: "text" }>["content"]) => void;
  onRouteChange: (id: string, route: "straight" | "elbow" | "curve") => void;
  onGeometry: (id: string, field: GeometryField, value: number, proportional: boolean) => boolean;
  onAlignInFrame: (mode: PresentationAlignment) => void;
  onArrange: (mode: PresentationAlignment) => void; arrangeDisabled: boolean; rootCount: number;
  onConnect: (fromId: string, toId: string) => void;
  onElements: (update: (elements: PresentationElement[]) => PresentationElement[]) => void;
  onSelect: (id: string) => void;
  activeStep: PresentationStep | null; onSteps: (update: (steps: PresentationStep[]) => PresentationStep[]) => void;
  background: string; onBackground: (color: string) => void;
}) {
  const { elements, selection, disabled, formatting, request, run, updateElement } = props;
  // The editor commands that can run now: the header and Arrange buttons follow them.
  const commands = new Set(props.commands.filter((command) => !command.disabledReason).map((command) => command.id));
  const t = useTranslations("wiki.presentations");
  const tabs = propertiesTabs(selection);
  const kind = selectionKind(selection);
  const [remembered, setRemembered] = useState<Record<string, PropertiesTab>>({});
  // A launcher or a double-click asks for a tab once; afterwards the author's choice stands.
  const [handled, setHandled] = useState(request.key);
  if (handled !== request.key) {
    setHandled(request.key);
    const wanted = request.tab === "primary" ? tabs[0] : request.tab;
    if (wanted && tabs.includes(wanted)) setRemembered((current) => ({ ...current, [kind]: wanted }));
  }
  const tab = chooseTab(tabs, undefined, remembered[kind]);
  const single = selection.length === 1 ? selection[0] : undefined;
  const { locked, byParent } = lockState(single, elements);
  const editLocked = disabled || locked || selection.some((element) => isPresentationElementLocked(elements, element.id));
  const shapes = formatting.shapes;

  if (!selection.length) return <div className="space-y-4">
    <div className="border-b pb-3">
      <h2 className="text-sm font-semibold">{t("properties.presentation")}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{t("selectionTools.emptySelectionHint")}</p>
    </div>
    <FormatRow label={t("canvasBackground")}><ColorPicker aria-label={t("canvasBackground")} value={props.background} onChange={props.onBackground} disabled={disabled} clearLabel={t("clearColor")} /></FormatRow>
  </div>;

  const body = (() => {
    switch (tab) {
      case "fill": {
        const shape = (single?.type === "shape" ? single : shapes[0]) as Shape | undefined;
        if (!shape) return null;
        const set = (change: (content: Shape["content"]) => Shape["content"]) => single ? formatting.updateContent(shape.id, (content) => change(content as Shape["content"])) : formatting.updateShapes(change);
        return <>
          {single && <ShapeSection shape={shape} disabled={editLocked} onRoute={(route) => props.onRouteChange(shape.id, route)}
            onDetach={() => updateElement(shape.id, (element) => element.type === "shape" ? { ...element, content: { ...element.content, connection: undefined } } : element)}
            set={(patch) => set((content) => ({ ...content, ...patch }))} />}
          <fieldset disabled={editLocked}><FillLineTab element={shape} set={set} disabled={editLocked} onEyedropper={formatting.requestColor} uploadPicture={formatting.uploadPicture} /></fieldset>
        </>;
      }
      case "effects": {
        const shape = (single?.type === "shape" ? single : shapes[0]) as Shape | undefined;
        if (!shape) return null;
        return <fieldset disabled={editLocked}><EffectsEditor effects={shape.content.effects} disabled={editLocked} onEyedropper={formatting.requestColor}
          onChange={(effects) => single ? formatting.updateContent(shape.id, (content) => ({ ...content, effects } as Shape["content"])) : formatting.updateShapes((content) => ({ ...content, effects }))} /></fieldset>;
      }
      case "text": return single && (single.type === "text" || single.type === "shape") && <fieldset disabled={editLocked}>
        <TextTab element={single} updateElement={updateElement} updateContent={formatting.updateContent} format={formatting.format} collaboration={props.collaboration}
          disabled={editLocked} onEyedropper={formatting.requestColor} onTextChange={props.onTextChange} onRichTextChange={props.onRichTextChange} />
      </fieldset>;
      case "picture": return single?.type === "image" && <PictureTab element={single} updateElement={updateElement} disabled={editLocked} />;
      case "chart": return single?.type === "chart" && <ChartTab element={single} updateElement={updateElement} disabled={editLocked} />;
      case "icon": return single?.type === "icon" && <IconTab element={single} updateElement={updateElement} disabled={editLocked} />;
      case "media": return (single?.type === "video" || single?.type === "audio") && <MediaTab element={single} updateElement={updateElement} disabled={editLocked} />;
      case "frame": return single?.type === "frame" && <FrameTab element={single} updateElement={updateElement} disabled={editLocked} onUngroup={() => run("ungroup")} />;
      case "layout": return single && <>
        <LayoutTab elements={elements} selected={single} disabled={disabled} onGeometry={props.onGeometry} onAlign={props.onAlignInFrame} run={run} commands={commands}
          onParent={(parentId) => updateElement(single.id, (element) => ({ ...element, parentId }))}
          onAttachContents={() => props.onElements((current) => current.map((element) => {
            if (element.id === single.id || element.parentId || isPresentationElementLocked(current, element.id)) return element;
            const inside = element.x >= single.x && element.y >= single.y && element.x + element.width <= single.x + single.width && element.y + element.height <= single.y + single.height;
            return inside ? { ...element, parentId: single.id } : element;
          }))} />
        <ConnectSection source={single} elements={elements} disabled={editLocked} onConnect={props.onConnect} />
      </>;
      case "animation": return single && <AnimationTab selected={single} activeStep={props.activeStep} disabled={disabled} onSteps={props.onSteps} />;
      case "arrange": return <ArrangeTab count={selection.length} rootCount={props.rootCount} disabled={disabled} arrangeDisabled={props.arrangeDisabled} run={run} commands={commands}
        onArrange={props.onArrange} onConnectPair={() => props.onConnect(selection[0].id, selection[1].id)} />;
      default: return null;
    }
  })();

  return <div data-testid="presentation-properties">
    <PropertiesHeader selection={selection} elements={elements} disabled={disabled} locked={locked} lockedByParent={byParent} run={run} commands={commands} onSelect={props.onSelect} />
    {tabs.length > 1 && <div role="tablist" aria-label={t("properties.tabs.label")} className="mt-3 flex gap-1 border-b pb-2">
      {tabs.map((id) => { const Icon = TAB_ICONS[id]; return <button key={id} type="button" role="tab" id={`properties-tab-${id}`} aria-selected={tab === id} aria-controls="properties-panel"
        aria-label={t(`properties.tabs.${id}`)} title={t(`properties.tabs.${id}`)} data-testid={`properties-tab-${id}`}
        onClick={() => setRemembered((current) => ({ ...current, [kind]: id }))}
        onKeyDown={(event) => {
          const index = tabs.indexOf(id), next = event.key === "ArrowRight" ? tabs[(index + 1) % tabs.length] : event.key === "ArrowLeft" ? tabs[(index - 1 + tabs.length) % tabs.length] : undefined;
          if (!next) return;
          event.preventDefault(); setRemembered((current) => ({ ...current, [kind]: next }));
          document.getElementById(`properties-tab-${next}`)?.focus();
        }}
        tabIndex={tab === id ? 0 : -1}
        className={cn("grid size-8 place-items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50", tab === id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted")}><Icon className="size-4" /></button>; })}
    </div>}
    {tab && <div id="properties-panel" role="tabpanel" aria-labelledby={`properties-tab-${tab}`} className="min-w-0">
      <h3 className="pt-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t(`properties.tabs.${tab}`)}</h3>
      {body}
    </div>}
  </div>;
}
