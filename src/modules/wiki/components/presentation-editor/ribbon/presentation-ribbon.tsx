"use client";
// The presentation editor's top chrome, laid out like PowerPoint's: a title bar with the Quick
// Access Toolbar (save, undo, redo), the document title, "Suchen" and Share/Present, then the
// ribbon -- Datei menu, the tabs (plus Formformat while a shape or text is selected) and the
// active tab's groups. Every command lives here; there is no separate tools menu.
import { useEffect, useRef, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, ChevronDown, ChevronUp, FileDown, History, Keyboard, Redo2, Save, Search, Settings, Share2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { CommandButton } from "./ribbon-primitives";
import { RibbonTabPanel } from "./ribbon-tabs";
import { ribbonTabs, type RibbonTab } from "./use-ribbon-state";
import type { RibbonModel } from "./ribbon-model";

export function PresentationRibbon({ model }: { model: RibbonModel }) {
  const t = useTranslations("wiki.presentations.ribbon");
  const { state, commands, run, shortcuts } = model;
  const command = (id: string) => commands.find((item) => item.id === id);
  const contextual = model.formatting.shapes.length > 0 || model.formatting.texts.length > 0;
  const tabs: RibbonTab[] = contextual ? [...ribbonTabs, "shapeFormat"] : ribbonTabs;
  const root = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<RibbonTab, HTMLButtonElement>());

  // A collapsed ribbon's open tab closes on a press elsewhere -- but not in a menu or gallery it opened.
  const { collapsed, open, closePeek } = state;
  useEffect(() => {
    if (!collapsed || !open) return;
    const press = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (root.current?.contains(target) || target.closest?.('[data-slot$="-content"], [role="menu"], [role="dialog"], [role="listbox"]')) return;
      closePeek();
    };
    document.addEventListener("pointerdown", press, true);
    return () => document.removeEventListener("pointerdown", press, true);
  }, [collapsed, open, closePeek]);

  const onTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.indexOf(state.tab);
    const next = event.key === "ArrowRight" ? tabs[(index + 1) % tabs.length] : event.key === "ArrowLeft" ? tabs[(index - 1 + tabs.length) % tabs.length]
      : event.key === "Home" ? tabs[0] : event.key === "End" ? tabs[tabs.length - 1] : undefined;
    if (!next) return;
    event.preventDefault();
    state.select(next);
    tabRefs.current.get(next)?.focus();
  };

  const fileItem = (id: string, icon: React.ReactNode, label?: string) => {
    const item = command(id);
    return item && <DropdownMenuItem disabled={Boolean(item.disabledReason)} title={item.disabledReason} onClick={() => run(id)}>{icon}{label ?? item.label}
      {shortcuts[id] && <DropdownMenuShortcut aria-hidden>{shortcuts[id]}</DropdownMenuShortcut>}</DropdownMenuItem>;
  };

  return <div ref={root} className="relative z-20 shrink-0 bg-background" data-testid="presentation-ribbon">
    <header className="flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border/60 px-2 py-1.5">
      <div role="toolbar" aria-label={t("quickAccess")} className="flex items-center">
        <CommandButton iconOnly command={command("save")} run={run} shortcuts={shortcuts} icon={<Save />} className="size-7" />
        <CommandButton iconOnly command={command("undo")} run={run} shortcuts={shortcuts} icon={<Undo2 />} label={t("undo")} className="size-7" />
        <CommandButton iconOnly command={command("redo")} run={run} shortcuts={shortcuts} icon={<Redo2 />} label={t("redo")} className="size-7" />
      </div>
      <span className="h-5 w-px bg-border/60" />
      <div className="flex min-w-0 flex-1 items-center gap-2">{model.title}</div>
      <Button type="button" variant="outline" size="sm" className="order-last w-full justify-start text-muted-foreground sm:order-none sm:w-56 lg:w-72" aria-label={t("searchLabel")} title={t("searchTip")} onClick={model.onSearch}>
        <Search className="size-3.5" /><span className="flex-1 text-left">{t("search")}</span><kbd className="text-[10px]">Alt+Q</kbd>
      </Button>
      <div className="flex items-center gap-1 text-xs">
        {model.saveStatus}
        <CommandButton command={command("share")} run={run} shortcuts={shortcuts} icon={<Share2 />} className="h-7 px-2 text-[0.8rem]" />
        {model.present("titleBar")}
      </div>
    </header>

    <div className="flex h-8 items-end gap-1 border-b border-border/60 px-2">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button" size="sm" className="mb-0.5 h-6 rounded-md px-3 text-xs" data-testid="presentation-file-menu" />}>{t("file")}</DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-64">
          <DropdownMenuItem onClick={model.onLeave}><ArrowLeft />{t("back")}</DropdownMenuItem>
          <DropdownMenuSeparator />
          {fileItem("save", <Save />)}
          {fileItem("share", <Share2 />)}
          {fileItem("exportPdf", <FileDown />)}
          {fileItem("exportPptx", <FileDown />, t("exportPptx"))}
          <DropdownMenuSeparator />
          {fileItem("history", <History />)}
          {fileItem("playback", <Settings />)}
          {fileItem("shortcutHelp", <Keyboard />)}
        </DropdownMenuContent>
      </DropdownMenu>
      <div role="tablist" aria-label={t("label")} className="flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto" onKeyDown={onTabKey}>
        {tabs.map((tab) => {
          const selected = state.tab === tab && open;
          return <button key={tab} type="button" role="tab" id={`ribbon-tab-${tab}`} aria-selected={state.tab === tab} aria-controls="ribbon-panel" tabIndex={state.tab === tab ? 0 : -1}
            ref={(element) => { if (element) tabRefs.current.set(tab, element); else tabRefs.current.delete(tab); }}
            data-testid={tab === "view" ? "presentation-view-menu" : `ribbon-tab-${tab}`}
            title={collapsed ? t("collapsedTabTip") : t("tabTip")}
            onClick={() => { if (collapsed && state.tab === tab && open) closePeek(); else state.select(tab); }}
            onDoubleClick={() => state.setCollapsed(!collapsed)}
            className={cn("relative h-7 shrink-0 rounded-t-md px-2.5 text-xs whitespace-nowrap outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50",
              selected && "font-semibold text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary",
              !selected && "text-muted-foreground",
              tab === "shapeFormat" && "text-primary before:absolute before:inset-x-1 before:top-0 before:h-0.5 before:bg-primary/60")}>
            {t(`tabs.${tab}`)}
          </button>;
        })}
      </div>
      <Button type="button" variant="ghost" size="icon-xs" className="mb-1" aria-label={collapsed ? t("pin") : t("collapse")} title={collapsed ? t("pin") : t("collapse")} aria-pressed={!collapsed}
        data-testid="ribbon-collapse" onClick={() => state.setCollapsed(!collapsed)}>{collapsed ? <ChevronDown /> : <ChevronUp />}</Button>
    </div>

    {open && <div id="ribbon-panel" role="tabpanel" aria-labelledby={`ribbon-tab-${state.tab}`} data-testid="presentation-toolbar"
      onClickCapture={(event) => {
        // A collapsed ribbon closes again once a command ran, as in PowerPoint; menus and galleries stay open.
        const button = (event.target as HTMLElement).closest("button, input, select");
        if (collapsed && button && !button.closest('[aria-haspopup], select, input')) setTimeout(closePeek, 0);
      }}
      className={cn("@container/ribbon flex h-[98px] items-stretch overflow-x-auto overflow-y-hidden border-b border-border/60 bg-background px-1 py-1 [scrollbar-width:thin]",
        collapsed && "absolute inset-x-0 top-full shadow-lg")}>
      <RibbonTabPanel tab={state.tab} model={model} />
    </div>}
  </div>;
}
