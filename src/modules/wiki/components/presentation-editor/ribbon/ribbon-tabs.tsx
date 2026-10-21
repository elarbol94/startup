"use client";
// The groups of each ribbon tab, named and ordered after PowerPoint's (German UI in brackets):
// Home (Start): Clipboard, Frames, Font, Paragraph, Drawing, Editing, Panes.
// Insert (Einfügen): Frames, Images, Illustrations, Text, Media.
// Design (Entwurf): Themes, Customize.  Slide Show: Start, Set Up, Export.
// Review (Überprüfen): Comments, Versions.  View (Ansicht): Show, Zoom, Panes.
// Shape Format (Formformat, contextual): Insert Shapes, Shape Styles, WordArt, Arrange.
import { useTranslations } from "next-intl";
import { AlignHorizontalJustifyCenter, BringToFront, ChartColumn, ClipboardPaste, Copy, Film, Group, History, ImagePlus, Images, Layers, Link2, Loader2, Lock, LockOpen, Map as MapIcon, Maximize2, MessageSquare, Paintbrush, Palette, PanelLeft, PanelRight, Scissors, Search, SendToBack, Settings, Shapes, Smile, SquareMousePointer, Square, Type, Ungroup, FileDown, Keyboard } from "lucide-react";
import { ColorPicker } from "@/components/ui/color-picker";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { presentationIconNames } from "../../../lib/presentation";
import { presentationAlignments } from "../../../lib/presentation-layout";
import { TextRibbonGroups, ShapeRibbonGroups } from "../format-pane/format-ribbon";
import { PresentationShapeGallery } from "../presentation-shape-gallery";
import { CommandButton, RibbonButton, RibbonGroup, RibbonStack } from "./ribbon-primitives";
import type { RibbonModel, RibbonPanel } from "./ribbon-model";
import type { RibbonTab } from "./use-ribbon-state";

const PANEL_ICONS: Record<RibbonPanel, React.ReactNode> = { properties: <PanelRight />, design: <Palette />, assets: <Images />, comments: <MessageSquare /> };

export function RibbonTabPanel({ tab, model }: { tab: RibbonTab; model: RibbonModel }) {
  const t = useTranslations("wiki");
  const r = useTranslations("wiki.presentations.ribbon");
  const { commands, run, shortcuts, formatting } = model;
  const command = (id: string) => commands.find((item) => item.id === id);
  const button = (id: string, icon: React.ReactNode, options: { large?: boolean; label?: string; testId?: string } = {}) =>
    <CommandButton command={command(id)} run={run} shortcuts={shortcuts} icon={icon} large={options.large} label={options.label} data-testid={options.testId} />;
  const panelButton = (panel: RibbonPanel, large = true) => <RibbonButton key={panel} large={large} label={t(`workspace.${panel}`)} icon={PANEL_ICONS[panel]}
    active={model.activePanel === panel} onClick={() => model.togglePanel(panel)} data-testid={`ribbon-panel-${panel}`} />;
  const pathButton = (large = false) => <RibbonButton large={large} label={t("presentations.path")} icon={<PanelLeft />} active={model.pathOpen} aria-expanded={model.pathOpen} onClick={model.togglePath} />;

  const shapesButton = (large = true) => <Popover open={model.shapeGallery.open} onOpenChange={model.shapeGallery.setOpen}>
    <PopoverTrigger render={<RibbonButton large={large} caret label={t("presentations.shapeGallery.title")} icon={<Shapes />} active={model.shapeGallery.armed} disabled={model.insertDisabled} data-testid="presentation-shapes-button" />} />
    <PopoverContent align="start" className="w-auto"><PresentationShapeGallery allowLock onPick={(entry, options) => model.shapeGallery.onPick(entry, options)} /></PopoverContent>
  </Popover>;
  const imageButton = (large: boolean) => <CommandButton command={command("addImage")} run={run} shortcuts={shortcuts} large={large}
    icon={model.uploading ? <Loader2 className="animate-spin" /> : <ImagePlus />} />;
  const studioMenu = (kind: "chart" | "icon", label: string, icon: React.ReactNode, choices: readonly string[], name: (choice: string) => string) =>
    <DropdownMenu><DropdownMenuTrigger render={<RibbonButton large caret label={label} icon={icon} disabled={model.insertDisabled} data-testid={`ribbon-insert-${kind}`} />} />
      <DropdownMenuContent>{choices.map((choice) => <DropdownMenuItem key={choice} onClick={() => model.addStudio(kind, choice)}>{name(choice)}</DropdownMenuItem>)}</DropdownMenuContent>
    </DropdownMenu>;

  const arrangeItems = <>
    {(["front", "back", "forward", "backward"] as const).map((id) => menuItem(id))}
    <DropdownMenuSeparator />
    {menuItem("group")}{menuItem("ungroup")}
    <DropdownMenuSeparator />
    {presentationAlignments.map((mode) => menuItem(`align-${mode}`))}
    <DropdownMenuSeparator />
    {menuItem("connect", t("presentations.layout.connect"))}{menuItem("detach")}
    <DropdownMenuSeparator />
    {menuItem("lock")}{menuItem("unlock")}
  </>;
  function menuItem(id: string, label?: string) {
    const item = command(id);
    return item && <DropdownMenuItem key={id} disabled={Boolean(item.disabledReason)} title={item.disabledReason} onClick={() => run(id)}>{label ?? item.label}
      {shortcuts[id] && <DropdownMenuShortcut aria-hidden>{shortcuts[id]}</DropdownMenuShortcut>}</DropdownMenuItem>;
  }
  const arrangeMenu = (large: boolean) => <DropdownMenu><DropdownMenuTrigger render={<RibbonButton large={large} caret label={t("presentations.layout.arrange")} icon={<Layers />} disabled={model.disabled} />} />
    <DropdownMenuContent className="min-w-60">{arrangeItems}</DropdownMenuContent></DropdownMenu>;
  const formatProps = { shapes: formatting.shapes, texts: formatting.texts, format: formatting.format, updateShapes: formatting.updateShapes, updateTexts: formatting.updateTexts,
    onOpenPane: model.onOpenPane, onEyedropper: formatting.requestColor, disabled: model.disabled };

  switch (tab) {
    case "home": return <>
      <RibbonGroup label={r("groups.clipboard")}>
        {button("paste", <ClipboardPaste />, { large: true })}
        <RibbonStack>{button("cut", <Scissors />)}{button("copy", <Copy />)}{button("duplicateSelection", <Copy />)}</RibbonStack>
        <RibbonStack>{button("copyFormat", <Paintbrush />)}{button("pasteFormat", <Paintbrush />)}</RibbonStack>
      </RibbonGroup>
      <RibbonGroup label={r("groups.frames")}>
        {button("addFrame", <Square />, { large: true })}
        <RibbonStack>{pathButton()}</RibbonStack>
      </RibbonGroup>
      <TextRibbonGroups {...formatProps} onTextKey={model.onTextKey} shortcuts={shortcuts} />
      <RibbonGroup label={r("groups.drawing")}>
        {shapesButton()}
        <RibbonStack>{button("addText", <Type />)}{imageButton(false)}</RibbonStack>
        {arrangeMenu(true)}
      </RibbonGroup>
      <RibbonGroup label={r("groups.editing")}>
        <RibbonStack>
          <RibbonButton label={r("find")} icon={<Search />} shortcut="Alt+Q" onClick={model.onSearch} />
          {button("selectAll", <SquareMousePointer />)}
        </RibbonStack>
      </RibbonGroup>
      <RibbonGroup label={r("groups.panes")}>{panelButton("properties")}</RibbonGroup>
    </>;
    case "insert": return <>
      <RibbonGroup label={r("groups.frames")}>{button("addFrame", <Square />, { large: true, label: r("newFrame") })}</RibbonGroup>
      <RibbonGroup label={r("groups.images")}>{imageButton(true)}</RibbonGroup>
      <RibbonGroup label={r("groups.illustrations")}>
        {shapesButton()}
        {studioMenu("icon", r("icons"), <Smile />, presentationIconNames, (name) => t(`presentations.interactions.icons.${name}`))}
        {studioMenu("chart", r("chart"), <ChartColumn />, ["bar", "line", "pie"], (kind) => t(`presentations.interactions.${kind}`))}
      </RibbonGroup>
      <RibbonGroup label={r("groups.text")}>{button("addText", <Type />, { large: true, label: r("textBox") })}</RibbonGroup>
      <RibbonGroup label={r("groups.media")}>
        {button("uploadMedia", <Film />, { large: true, label: r("video") })}
        <RibbonButton large label={r("mediaLibrary")} icon={<Images />} active={model.activePanel === "assets"} onClick={() => model.togglePanel("assets")} />
      </RibbonGroup>
    </>;
    case "design": return <>
      <RibbonGroup label={r("groups.themes")}><RibbonButton large label={r("themes")} icon={<Palette />} active={model.activePanel === "design"} onClick={() => model.togglePanel("design")} /></RibbonGroup>
      <RibbonGroup label={r("groups.customize")}>
        <div className="flex h-[70px] flex-col items-center justify-start gap-1 px-1.5 pt-1.5 text-xs">
          <ColorPicker aria-label={r("background")} value={model.background} onChange={model.setBackground} disabled={model.disabled} clearLabel={t("presentations.colorDefault")} />
          <span>{r("background")}</span>
        </div>
      </RibbonGroup>
    </>;
    case "slideShow": return <>
      <RibbonGroup label={r("groups.startShow")}>{model.present("ribbon")}</RibbonGroup>
      <RibbonGroup label={r("groups.setUp")}>
        {button("playback", <Settings />, { large: true })}
        {pathButton(true)}
      </RibbonGroup>
      <RibbonGroup label={r("groups.export")}>{button("exportPdf", <FileDown />, { large: true })}{button("exportPptx", <FileDown />, { large: true, label: r("exportPptx") })}</RibbonGroup>
    </>;
    case "review": return <>
      <RibbonGroup label={r("groups.comments")}>{panelButton("comments")}</RibbonGroup>
      <RibbonGroup label={r("groups.versions")}>{button("history", <History />, { large: true })}</RibbonGroup>
      <RibbonGroup label={r("groups.help")}>{button("shortcutHelp", <Keyboard />, { large: true })}</RibbonGroup>
    </>;
    case "view": return <>
      <RibbonGroup label={r("groups.show")} launcher={{ label: t("presentations.gridGuides.title"), onClick: () => run("gridGuides"), testId: "view-grid-settings" }}>
        <RibbonStack className="px-1">
          {([["toggleRuler", "view-ruler"], ["toggleGrid", "view-gridlines"], ["toggleGuides", "view-guides"]] as const).map(([id, testId]) => {
            const item = command(id);
            return item && <label key={id} className="flex h-[22px] items-center gap-1.5 text-xs" title={id === "toggleGrid" ? `${item.label} (${shortcuts.toggleGrid})` : id === "toggleGuides" ? `${item.label} (${shortcuts.toggleGuides})` : item.label}>
              <input type="checkbox" data-testid={testId} checked={Boolean(item.active)} onChange={() => run(id)} className="size-3.5 accent-primary" />{item.label}
            </label>;
          })}
        </RibbonStack>
      </RibbonGroup>
      <RibbonGroup label={r("groups.zoom")}>
        {button("overview", <Maximize2 />, { large: true, label: r("fitToWindow") })}
        {button("toggleMiniMap", <MapIcon />, { large: true })}
      </RibbonGroup>
      <RibbonGroup label={r("groups.panes")}>
        {pathButton(true)}
        {(["properties", "design", "assets", "comments"] as const).map((panel) => panelButton(panel))}
      </RibbonGroup>
    </>;
    case "shapeFormat": return <div role="toolbar" aria-label={t("presentations.formatPane.ribbon")} data-testid="presentation-format-ribbon" className="flex h-full">
      <ShapeRibbonGroups {...formatProps} onChangeShape={formatting.changeShape} onMerge={formatting.mergeSelection} canMerge={formatting.canMerge}
        onEditPoints={formatting.canEditPoints ? formatting.startEditPoints : undefined} insertShapes={shapesButton()} />
      <RibbonGroup label={t("presentations.layout.arrange")}>
        <RibbonStack>{button("front", <BringToFront />)}{button("back", <SendToBack />)}{button("forward", <BringToFront />)}</RibbonStack>
        <RibbonStack>
          <DropdownMenu><DropdownMenuTrigger render={<RibbonButton caret label={r("align")} icon={<AlignHorizontalJustifyCenter />} disabled={model.disabled} />} />
            <DropdownMenuContent>{presentationAlignments.map((mode) => menuItem(`align-${mode}`))}<DropdownMenuSeparator />{menuItem("connect", t("presentations.layout.connect"))}</DropdownMenuContent></DropdownMenu>
          {button("group", <Group />)}{button("ungroup", <Ungroup />)}
        </RibbonStack>
        <RibbonStack>{button("lock", <Lock />)}{button("unlock", <LockOpen />)}{button("detach", <Link2 />)}</RibbonStack>
      </RibbonGroup>
      <RibbonGroup label={r("groups.format")}>
        <RibbonButton large label={t("presentations.formatPane.openPane")} icon={<PanelRight />} data-testid="format-pane-button" disabled={model.disabled}
          onClick={() => model.onOpenPane(formatting.shapes.length ? "shape" : "text")} />
        {button("setDefault", <Shapes />, { large: true })}
      </RibbonGroup>
    </div>;
  }
}
