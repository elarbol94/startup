"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Columns2, Plus, X, Search, PanelTop, ArrowUpRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { moduleNav } from "@/modules/registry";
import { searchWorkspacePages } from "@/modules/context/actions";
import { cn } from "@/lib/utils";
import { MAX_WORKSPACE_TABS, MIN_SPLIT_WIDTH, splitRatio, workspaceHref, restoreWorkspace, workspaceDestinationKey } from "./model";

type Tab = { id: string; href: string; title: string };
type Result = { href: string; title: string };
const subscribeFrame = () => () => {};
function isWorkspaceFrame() {
  try { return window.frameElement?.getAttribute("data-workspace-pane") === "true"; } catch { return false; }
}

export function AppWorkspace({ children, navigation, userId }: { children: ReactNode; navigation: ReactNode; userId: string }) {
  const t = useTranslations("appWorkspace");
  const nav = useTranslations("nav");
  const pathname = usePathname();
  const search = useSearchParams();
  const embedded = useSyncExternalStore(subscribeFrame, isWorkspaceFrame, () => false);
  const [sessionReady, setSessionReady] = useState(false);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [active, setActive] = useState("primary");
  const [leftPane, setLeftPane] = useState("primary");
  const [secondary, setSecondary] = useState<string | null>(null);
  const [split, setSplit] = useState(false);
  const [width, setWidth] = useState(0);
  const [ratio, setRatio] = useState(50);
  const [resizing, setResizing] = useState(false);
  const [title, setTitle] = useState("");
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [closeCandidate, setCloseCandidate] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Set<string>>(new Set());
  const primary = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const frames = useRef(new Map<string, HTMLIFrameElement>());
  const [sideOnOpen, setSideOnOpen] = useState(false);
  const href = pathname + (search.size ? `?${search.toString()}` : "");
  const wide = width >= MIN_SPLIT_WIDTH;
  const showSplit = wide && split && secondary !== null;
  const currentTitle = title || moduleNav.find(item => pathname === item.href)?.key;
  const primaryTitle = title || (currentTitle ? nav(currentTitle as typeof moduleNav[number]["key"]) : t("current"));

  useEffect(() => {
    const element = surface.current;
    if (!element || embedded) return;
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [embedded]);

  useEffect(() => {
    if (isWorkspaceFrame()) return;
    const frame = requestAnimationFrame(() => {
      try {
        const saved = restoreWorkspace(sessionStorage.getItem(`app-workspace:${userId}`), window.location.origin);
        if (saved) { setTabs(saved.tabs); setActive(saved.active); setLeftPane(saved.leftPane); setSecondary(saved.secondary); setSplit(saved.split); setRatio(saved.ratio); }
      } catch { /* Tabs also work when browser storage is disabled. */ }
      setSessionReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [userId]);

  useEffect(() => {
    if (!sessionReady || isWorkspaceFrame()) return;
    try { sessionStorage.setItem(`app-workspace:${userId}`, JSON.stringify({ tabs: tabs.map(tab => ({ ...tab, href: frames.current.get(tab.id)?.dataset.currentHref || tab.href })), active, leftPane, secondary, split, ratio })); } catch { /* Storage is optional. */ }
  }, [tabs, active, leftPane, secondary, split, ratio, sessionReady, userId]);

  // Sidebar and browser history navigation reveal the main page, not a hidden tab.
  const previousHref = useRef(href);
  useEffect(() => {
    if (previousHref.current === href) return;
    previousHref.current = href;
    const frame = requestAnimationFrame(() => setActive("primary"));
    return () => cancelAnimationFrame(frame);
  }, [href]);

  // Titles follow the actual page, including client-side navigation inside panes.
  useEffect(() => {
    const element = primary.current;
    if (!element) return;
    const update = () => {
      const heading = element.querySelector("h1");
      const next = heading?.textContent?.trim().slice(0, 160) || "";
      setTitle(previous => previous === next ? previous : next);
      if (embedded) window.parent.postMessage({ type: "app-workspace-location", href: window.location.pathname + window.location.search + window.location.hash, title: next }, window.location.origin);
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(element, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [href, embedded]);

  useEffect(() => {
    if (embedded) return;
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== "app-workspace-location") return;
      const id = [...frames.current].find(([, frame]) => frame.contentWindow === event.source)?.[0];
      if (!id || typeof event.data.href !== "string") return;
      const nextHref = workspaceHref(event.data.href, window.location.origin);
      if (!nextHref) return;
      const nextTitle = typeof event.data.title === "string" ? event.data.title.slice(0, 160) : "";
      setLoaded(current => current.has(id) ? current : new Set(current).add(id));
      // Keep iframe src stable: changing it would reload an editor after navigation.
      setTabs(current => nextTitle && current.some(tab => tab.id === id && tab.title !== nextTitle) ? current.map(tab => tab.id === id ? { ...tab, title: nextTitle } : tab) : current);
      const frame = frames.current.get(id);
      if (frame) frame.dataset.currentHref = nextHref;
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [embedded]);

  useEffect(() => {
    if (!picker) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true); setFailed(false);
      void searchWorkspacePages(query)
        .then(items => {
          if (cancelled) return;
          const unique = new Map<string, Result>();
          for (const item of items) { const key = workspaceDestinationKey(item.href); if (!unique.has(key)) unique.set(key, { href: item.href, title: item.title }); }
          setResults([...unique.values()].slice(0, 60));
        }).catch(() => { if (!cancelled) { setResults([]); setFailed(true); } })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 180);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [picker, query]);

  function openPicker(side = false) {
    setSideOnOpen(side);
    setQuery(""); setResults([]); setLoading(true); setPicker(true);
  }
  function openTab(item: Result) {
    const safe = workspaceHref(item.href, window.location.origin);
    if (!safe) return;
    const existing = tabs.find(tab => (frames.current.get(tab.id)?.dataset.currentHref || tab.href) === safe);
    if (!existing && tabs.length >= MAX_WORKSPACE_TABS) { toast.info(t("limit", { count: MAX_WORKSPACE_TABS })); return; }
    const id = existing?.id || crypto.randomUUID();
    if (!existing) setTabs(current => [...current, { id, href: safe, title: item.title }]);
    setActive(id); setSecondary(id);
    if (sideOnOpen) { setLeftPane(active); setSplit(true); }
    setPicker(false);
  }
  function choose(id: string) {
    setActive(id);
    if (id !== leftPane) setSecondary(id);
  }
  function closeTab(id: string) {
    setTabs(current => current.filter(tab => tab.id !== id));
    if (active === id) setActive("primary");
    if (secondary === id || leftPane === id) { setSecondary(null); setLeftPane("primary"); setSplit(false); }
    setLoaded(current => { const next = new Set(current); next.delete(id); return next; });
    setCloseCandidate(null);
  }
  function requestClose(id: string) {
    const child = frames.current.get(id)?.contentWindow;
    try {
      // Honour editors' existing unsaved-change guards before destroying a pane.
      const event = child?.document.createEvent("Event");
      if (event && child) {
        event.initEvent("beforeunload", false, true);
        if (!child.dispatchEvent(event)) { setCloseCandidate(id); return; }
      }
    } catch { setCloseCandidate(id); return; }
    closeTab(id);
  }

  const primaryVisible = showSplit ? leftPane === "primary" || secondary === "primary" : active === "primary";
  const sections = moduleNav.filter(item => `${nav(item.key)} ${item.href}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const buttonClass = "inline-flex h-8 shrink-0 items-center justify-center rounded-md px-2 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring";

  return <div className="flex min-h-screen flex-1 flex-col md:flex-row" data-app-shell data-workspace-embedded={embedded || undefined}>
    {!embedded && <div className="contents" data-app-chrome>{navigation}</div>}
    <main data-app-main className={cn("rail-content-transition min-w-0 flex-1 duration-[220ms] motion-reduce:transition-none", !embedded && "md:pl-[var(--app-rail-width,3.5rem)]")}>
      <div ref={surface} className="min-w-0" data-workspace-root>
        {!embedded && <div className="sticky top-0 z-40 flex h-11 min-w-0 items-center gap-1 border-b bg-background px-2" data-workspace-toolbar>
          <div role="tablist" aria-label={t("tabs")} className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" onKeyDown={event => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
            const index = items.indexOf(document.activeElement as HTMLButtonElement);
            if (index < 0) return;
            event.preventDefault();
            const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + items.length) % items.length;
            items[next].focus(); items[next].click();
          }}>
            {[{ id: "primary", title: primaryTitle }, ...tabs].map(tab => <div key={tab.id} className={cn("flex max-w-52 shrink-0 items-center rounded-md border border-transparent", active === tab.id ? "border-border bg-muted" : "hover:bg-muted/50")}>
              <button type="button" id={`workspace-tab-${tab.id}`} role="tab" aria-selected={active === tab.id} aria-controls={`workspace-panel-${tab.id}`} tabIndex={active === tab.id ? 0 : -1} title={tab.title} onClick={() => choose(tab.id)} className="h-8 min-w-0 truncate rounded-md px-3 text-xs font-medium focus-visible:outline-2 focus-visible:outline-ring">{tab.title}</button>
              {tab.id !== "primary" && <button type="button" className={cn(buttonClass, "px-1.5")} aria-label={t("closeTab", { title: tab.title })} onClick={() => requestClose(tab.id)}><X className="size-3" /></button>}
            </div>)}
          </div>
          <button type="button" className={buttonClass} title={t("newTab")} aria-label={t("newTab")} onClick={() => openPicker()}><Plus className="size-4" /><span className="ml-1 hidden text-xs sm:inline">{t("newTab")}</span></button>
          <button type="button" className={cn(buttonClass, showSplit && "bg-muted text-foreground")} title={wide ? t(showSplit ? "single" : "split") : t("narrow")} aria-label={t(showSplit ? "single" : "split")} aria-pressed={showSplit} disabled={!wide} onClick={() => { if (showSplit) setSplit(false); else if (tabs.length) { setLeftPane(active); setSecondary(tabs.find(tab => tab.id !== active)?.id || "primary"); setSplit(true); } else openPicker(true); }}><Columns2 className="size-4" /></button>
        </div>}
        <div data-workspace-content className={cn("relative min-w-0", !embedded && "flex h-[calc(100dvh-2.75rem)] max-md:h-[calc(100dvh-6.25rem)] overflow-hidden")}>
          <div id="workspace-panel-primary" ref={primary} role={embedded ? undefined : "tabpanel"} aria-labelledby={embedded ? undefined : "workspace-tab-primary"} hidden={!primaryVisible} className={cn("min-w-0 p-4 sm:p-6", !embedded && "h-full overflow-auto", showSplit && leftPane === "primary" ? "shrink-0 border-r" : "flex-1")} style={showSplit ? { order: leftPane === "primary" ? 0 : 2, width: leftPane === "primary" ? `${splitRatio(ratio, width)}%` : undefined } : undefined}>
            {children}
          </div>
          {showSplit && <div role="separator" tabIndex={0} aria-label={t("resize")} aria-orientation="vertical" aria-valuemin={30} aria-valuemax={70} aria-valuenow={Math.round(splitRatio(ratio, width))} className="relative order-1 z-20 w-1.5 shrink-0 cursor-col-resize touch-none bg-border/50 hover:bg-primary/40 focus-visible:bg-primary/40" onDoubleClick={() => setRatio(50)} onKeyDown={event => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "Home") { event.preventDefault(); setRatio(value => event.key === "Home" ? 50 : splitRatio(value + (event.key === "ArrowLeft" ? -5 : 5), width)); }
          }} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setResizing(true); }} onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId) && surface.current) setRatio(splitRatio((event.clientX - surface.current.getBoundingClientRect().left) / width * 100, width)); }} onPointerUp={event => { event.currentTarget.releasePointerCapture(event.pointerId); setResizing(false); }} onPointerCancel={() => setResizing(false)} onLostPointerCapture={() => setResizing(false)} />}
          {tabs.map(tab => <div key={tab.id} id={`workspace-panel-${tab.id}`} role="tabpanel" aria-labelledby={`workspace-tab-${tab.id}`} hidden={showSplit ? leftPane !== tab.id && secondary !== tab.id : active !== tab.id} className={cn("relative h-full min-w-0", showSplit && leftPane === tab.id ? "shrink-0" : "flex-1")} style={showSplit ? { order: leftPane === tab.id ? 0 : 2, width: leftPane === tab.id ? `${splitRatio(ratio, width)}%` : undefined } : undefined}>
            {!loaded.has(tab.id) && <div role="status" className="absolute inset-0 grid place-items-center bg-background"><span className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{t("loading")}</span></div>}
            <iframe ref={frame => { if (frame) frames.current.set(tab.id, frame); else frames.current.delete(tab.id); }} data-workspace-pane="true" name={`app-workspace:${tab.id}`} src={tab.href} title={tab.title} className={cn("h-full w-full border-0", !loaded.has(tab.id) && "invisible", resizing && "pointer-events-none")} onLoad={event => {
              // Non-app pages (for example expired sign-in) must remain reachable too.
              try { if (!event.currentTarget.contentDocument?.querySelector('[data-app-shell]')) setLoaded(current => new Set(current).add(tab.id)); } catch { setLoaded(current => new Set(current).add(tab.id)); }
            }} />
          </div>)}
        </div>
      </div>
    </main>
    {!embedded && <>
      <Dialog open={picker} onOpenChange={setPicker}><DialogContent className="flex max-h-[80dvh] flex-col gap-3 sm:max-w-xl"><DialogHeader><DialogTitle>{t(sideOnOpen ? "openBeside" : "newTab")}</DialogTitle><DialogDescription>{t("pickerHint")}</DialogDescription></DialogHeader>
        <div className="relative"><Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" /><Input autoFocus className="pl-9" aria-label={t("search")} placeholder={t("search")} maxLength={200} value={query} onChange={event => { setQuery(event.target.value); setResults([]); setLoading(true); }} /></div>
        <div className="min-h-0 overflow-y-auto">
          <div className="flex flex-wrap gap-1 pb-3">{sections.map(item => <Button key={item.href} size="sm" variant="outline" onClick={() => openTab({ href: item.href, title: nav(item.key) })}><item.icon className="size-3.5" />{nav(item.key)}</Button>)}</div>
          {loading && <p role="status" className="p-3 text-sm text-muted-foreground">{t("loading")}</p>}
          {failed && <p role="alert" className="p-3 text-sm text-destructive">{t("failed")}</p>}
          {!loading && !failed && results.length === 0 && <p className="p-3 text-sm text-muted-foreground">{t("empty")}</p>}
          {results.map(item => <button key={item.href} type="button" className="flex w-full items-center gap-3 rounded-md p-2.5 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring" onClick={() => openTab(item)}><PanelTop className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate text-sm">{item.title}</span><ArrowUpRight className="size-3.5 text-muted-foreground" /></button>)}
        </div>
      </DialogContent></Dialog>
      <Dialog open={closeCandidate !== null} onOpenChange={open => { if (!open) setCloseCandidate(null); }}><DialogContent><DialogHeader><DialogTitle>{t("unsavedTitle")}</DialogTitle><DialogDescription>{t("unsavedBody")}</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setCloseCandidate(null)}>{t("keep")}</Button><Button variant="destructive" onClick={() => closeCandidate && closeTab(closeCandidate)}>{t("discard")}</Button></div></DialogContent></Dialog>
    </>}
  </div>;
}
