"use client";

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FileText, LibraryBig, Presentation, Search, Loader2, Navigation } from "lucide-react";
import { moduleNav } from "@/modules/registry";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createDoubleShiftDetector } from "../lib/command-search";
import { searchWikiNavigation } from "../navigation-actions";
import { SearchSnippet } from "./search-snippet";

const NavigationContext = createContext({ openSearch: () => {}, userId: "" });
export const useWikiNavigation = () => useContext(NavigationContext);
const subscribe = (listener: () => void) => {
  window.addEventListener("storage", listener);
  window.addEventListener("wiki-preference", listener);
  return () => { window.removeEventListener("storage", listener); window.removeEventListener("wiki-preference", listener); };
};
export function useWikiLocalSetting(key: string) {
  const raw = useSyncExternalStore(subscribe, () => { try { return localStorage.getItem(key); } catch { return null; } }, () => null);
  return [raw, (value: unknown) => {
    try { localStorage.setItem(key, JSON.stringify(value)); window.dispatchEvent(new Event("wiki-preference")); } catch { /* Browser storage may be disabled. */ }
  }] as const;
}
export function parseWikiList(raw: string | null): string[] {
  try { const parsed: unknown = JSON.parse(raw ?? "[]"); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(0, 30) : []; } catch { return []; }
}
export const wikiItemIcons = { document: FileText, source: LibraryBig, presentation: Presentation, section: Navigation };

export function WikiNavigation({ userId, children }: { userId: string; children: React.ReactNode }) {
  const t = useTranslations("wiki.workspace");
  const nav = useTranslations("nav");
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [results, setResults] = useState<Awaited<ReturnType<typeof searchWikiNavigation>>>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [recentRaw] = useWikiLocalSetting(`wiki-recent:${userId}`);
  const recent = parseWikiList(recentRaw);
  const destinations = loading && !query.trim() ? [] : moduleNav.filter((item) => `${nav(item.key)} ${item.key} ${item.href}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).map((item) => ({ id: item.href, href: item.href, title: nav(item.key), kind: "section" as const, updatedAt: 0, snippet: "" }));
  const filtered = [...results, ...destinations].filter((item) => kind === "all" || item.kind === kind);
  const visible = query.trim() ? filtered : [...filtered].sort((a, b) => {
    const rank = (href: string) => { const index = recent.findIndex((path) => path === href || path.startsWith(`${href}/`)); return index < 0 ? 999 : index; };
    return rank(a.href) - rank(b.href);
  });
  const selected = Math.min(active, Math.max(0, visible.length - 1));

  function openSearch() {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery(""); setKind("all"); setActive(0); setResults([]); setLoading(true); setFailed(false); setOpen(true);
  }
  useEffect(() => {
    if (!/^\/wiki\/(pages|sources|presentations)\/.+/.test(pathname)) return;
    try {
      const key = `wiki-recent:${userId}`;
      localStorage.setItem(key, JSON.stringify([pathname, ...parseWikiList(localStorage.getItem(key)).filter((href) => href !== pathname)].slice(0, 20)));
      window.dispatchEvent(new Event("wiki-preference"));
    } catch { /* Navigation works without storage. */ }
  }, [pathname, userId]);
  useEffect(() => {
    const detector = createDoubleShiftDetector();
    const handle = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (event.target as HTMLElement)?.closest?.("[data-wiki-command-scope], input, textarea, select, [contenteditable=true], [role=dialog], [role=menu], [data-shortcut-recorder]") || document.querySelector('[aria-modal="true"]')) { detector.reset(); return; }
      if (detector.handle(event, performance.now())) { event.preventDefault(); openSearch(); }
    };
    window.addEventListener("keydown", handle, true);
    window.addEventListener("keyup", handle, true);
    const interruptions = ["blur", "pointerdown", "focusin", "compositionstart", "visibilitychange"] as const;
    for (const type of interruptions) window.addEventListener(type, detector.reset, true);
    return () => {
      window.removeEventListener("keydown", handle, true); window.removeEventListener("keyup", handle, true);
      for (const type of interruptions) window.removeEventListener(type, detector.reset, true);
    };
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true); setFailed(false);
      void searchWikiNavigation(query, parseWikiList(recentRaw)).then((next) => { if (!cancelled) setResults(next); })
        .catch(() => { if (!cancelled) { setResults([]); setFailed(true); } })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, query ? 180 : 0);
    return () => { clearTimeout(timer); cancelled = true; };
  }, [open, query, recentRaw]);
  useEffect(() => { document.getElementById(`wiki-jump-${selected}`)?.scrollIntoView({ block: "nearest" }); }, [selected]);
  function navigate(href: string) { setOpen(false); router.push(href); }
  return <NavigationContext.Provider value={{ openSearch, userId }}>
    {children}
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent finalFocus={returnFocus} className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader><DialogTitle>{t("switcher")}</DialogTitle><DialogDescription>{t("switcherHint")}</DialogDescription></DialogHeader>
        <div className="relative"><Search className="absolute top-3 left-3 size-4 text-muted-foreground" />
          <Input autoFocus role="combobox" aria-label={t("search")} aria-expanded aria-controls="wiki-jump-results" aria-autocomplete="list" aria-activedescendant={visible.length ? `wiki-jump-${selected}` : undefined}
            className="h-11 pr-10 pl-10" placeholder={t("searchPlaceholder")} value={query} maxLength={200}
            onChange={(event) => { setQuery(event.target.value); setResults([]); setLoading(true); setActive(0); }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setActive((selected + (event.key === "ArrowDown" ? 1 : -1) + visible.length) % Math.max(1, visible.length)); }
              if (event.key === "Enter" && visible[selected]) { event.preventDefault(); navigate(visible[selected].href); }
            }} />
          {loading && <Loader2 className="absolute top-3 right-3 size-4 animate-spin" />}
        </div>
        <div className="flex flex-wrap gap-1">{["all", "document", "source", "presentation", "section"].map((value) => <Button key={value} size="sm" variant={kind === value ? "secondary" : "ghost"} aria-pressed={kind === value} onClick={() => { setKind(value); setActive(0); }}>{t(value)}</Button>)}</div>
        <div id="wiki-jump-results" role="listbox" aria-label={t("switcher")} aria-busy={loading} className="min-h-24 overflow-y-auto">
          {visible.map((item, index) => { const Icon = wikiItemIcons[item.kind]; return <div role="option" aria-selected={index === selected} id={`wiki-jump-${index}`} key={item.href} onClick={() => navigate(item.href)} onMouseMove={() => setActive(index)} className={cn("flex cursor-pointer items-center gap-3 rounded-lg px-3 py-3", index === selected && "bg-accent")}>
            <Icon className="size-4 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.title}</p><p className="truncate text-xs text-muted-foreground">{item.snippet ? <SearchSnippet value={item.snippet} /> : t(item.kind)}</p></div>
          </div>; })}
          {!visible.length && <p role="status" className="p-6 text-center text-sm text-muted-foreground">{t(loading ? "loading" : failed ? "searchFailed" : "empty")}</p>}
        </div>
        <p className="border-t pt-3 text-xs text-muted-foreground">{t("keyboardHint")}</p>
      </DialogContent>
    </Dialog>
  </NavigationContext.Provider>;
}

export function WikiSearchButton() {
  const { openSearch } = useWikiNavigation();
  const t = useTranslations("wiki.workspace");
  return <button type="button" onClick={openSearch} className="flex min-h-14 w-full items-center gap-3 rounded-xl border bg-card px-4 text-left shadow-sm transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"><Search className="size-5 shrink-0 text-muted-foreground" /><span className="flex-1 text-sm text-muted-foreground">{t("searchPlaceholder")}</span><kbd className="shrink-0 rounded border px-2 py-1 text-xs">⇧ ⇧</kbd></button>;
}
