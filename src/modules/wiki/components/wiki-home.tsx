"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpRight, Clock3, Pin, SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { WikiNavigationItem } from "../navigation-queries";
import { resolveWikiNavigationItems } from "../navigation-actions";
import { parseWikiList, useWikiLocalSetting, useWikiNavigation, WikiSearchButton, wikiItemIcons } from "./wiki-navigation";
import { WIKI_PAGE_CLASS } from "./wiki-page-class";

const sections = ["document", "source", "presentation", "pinned", "recent"] as const;
type Section = typeof sections[number];
const libraryPaths = { document: "/wiki/pages", source: "/wiki/sources", presentation: "/wiki/presentations" };

export function WikiHome({ items: latestItems, actions }: { items: WikiNavigationItem[]; actions: React.ReactNode }) {
  const t = useTranslations("wiki.workspace");
  const locale = useLocale();
  const { userId, openSearch } = useWikiNavigation();
  const [customizing, setCustomizing] = useState(false);
  const [orderRaw, saveOrder] = useWikiLocalSetting(`wiki-home-order:${userId}`);
  const [hiddenRaw, saveHidden] = useWikiLocalSetting(`wiki-home-hidden:${userId}`);
  const [pinsRaw, savePins] = useWikiLocalSetting(`wiki-home-pins:${userId}`);
  const [compactRaw, saveCompact] = useWikiLocalSetting(`wiki-home-compact:${userId}`);
  const [recentRaw] = useWikiLocalSetting(`wiki-recent:${userId}`);
  const [savedItems, setSavedItems] = useState<WikiNavigationItem[]>([]);
  const missingPaths = JSON.stringify([...new Set([...parseWikiList(pinsRaw), ...parseWikiList(recentRaw)])].filter((href) => !latestItems.some((item) => item.href === href)).slice(0, 50));
  useEffect(() => {
    let cancelled = false;
    const paths = JSON.parse(missingPaths) as string[];
    void resolveWikiNavigationItems(paths).then((resolved) => { if (!cancelled) setSavedItems(resolved); }).catch(() => {});
    return () => { cancelled = true; };
  }, [missingPaths]);
  const items = [...latestItems, ...savedItems.filter((item) => !latestItems.some((other) => other.href === item.href))];
  const savedOrder = parseWikiList(orderRaw).filter((value): value is Section => sections.includes(value as Section));
  const order = [...new Set([...savedOrder, ...sections])];
  const hidden = parseWikiList(hiddenRaw);
  const pins = parseWikiList(pinsRaw);
  const recent = parseWikiList(recentRaw);
  const compact = compactRaw === "true";
  const formatter = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" });
  function reorder(section: Section, offset: number) {
    const next = [...order]; const index = next.indexOf(section);
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    saveOrder(next);
  }
  function togglePin(href: string) { savePins(pins.includes(href) ? pins.filter((pin) => pin !== href) : [href, ...pins].slice(0, 30)); }
  function sectionItems(section: Section) {
    if (section === "pinned") return items.filter((item) => pins.includes(item.href)).sort((a, b) => pins.indexOf(a.href) - pins.indexOf(b.href));
    if (section === "recent") return recent.flatMap((href) => { const item = items.find((item) => href === item.href || (item.kind === "source" && href.startsWith(`${item.href}/`))); return item ? [item] : []; }).filter((item, index, all) => all.findIndex((other) => other.href === item.href) === index).slice(0, 6);
    return items.filter((item) => item.kind === section).slice(0, compact ? 6 : 4);
  }
  // An empty "Pinned" card only restates how pinning works; it is replaced by a
  // one-line hint under the search until something is pinned.
  const pinnedEmpty = !hidden.includes("pinned") && sectionItems("pinned").length === 0;
  return <main className={WIKI_PAGE_CLASS} data-testid="wiki-home">
    <PageHeader title={t("title")} description={t("subtitle")} actions={<>
      <Button variant="ghost" onClick={() => setCustomizing(true)}><SlidersHorizontal className="size-4" />{t("customize")}</Button>
      {actions}
    </>} />
    <section aria-label={t("search")}><WikiSearchButton /></section>
    {pinnedEmpty && <p className="mx-1 mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Pin className="size-3 shrink-0" />{t("pinHint")}</p>}
    <div className="mt-5 grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {order.filter((section) => !hidden.includes(section) && !(section === "pinned" && pinnedEmpty)).map((section) => {
        const entries = sectionItems(section);
        const Icon = section === "pinned" ? Pin : section === "recent" ? Clock3 : wikiItemIcons[section];
        return <section key={section} data-wiki-section={section} className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-card">
          <div className="flex min-h-[52px] items-center gap-2.5 border-b border-line-soft px-[18px] py-2.5">
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{t(section)}</h2>
            {section !== "pinned" && section !== "recent" && <Link href={libraryPaths[section]} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-mr-2 shrink-0 text-muted-foreground")}>{t("viewAll")}<ArrowUpRight data-icon="inline-end" className="size-3.5" /></Link>}
          </div>
          {entries.length ? <ul className="divide-y divide-line-soft">{entries.map((item) => {
            const ItemIcon = wikiItemIcons[item.kind]; const pinned = pins.includes(item.href);
            return <li key={item.href} className="group flex items-center text-[13.5px] transition-colors hover:bg-accent">
              <Link href={item.href} className={cn("flex min-w-0 flex-1 items-center gap-3 pl-[18px] outline-none focus-visible:bg-accent", compact ? "py-2" : "py-[11px]")}><ItemIcon className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0"><span className="block truncate font-medium" title={item.title}>{item.title}</span>{!compact && <span className="mt-0.5 block text-xs text-muted-foreground">{t(item.kind)} · {formatter.format(new Date(item.updatedAt))}</span>}</span></Link>
              <button type="button" aria-label={t(pinned ? "unpin" : "pin", { title: item.title })} aria-pressed={pinned} onClick={() => togglePin(item.href)} className={cn("mr-2.5 grid size-7 shrink-0 place-items-center rounded-md transition-colors outline-none hover:bg-background focus-visible:outline-2 focus-visible:outline-ring", pinned ? "text-brand-ink" : "text-muted-foreground opacity-60 hover:opacity-100 focus-visible:opacity-100")}><Pin className={cn("size-3.5", pinned && "fill-current")} /></button>
            </li>;
          })}</ul> : <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-[18px] py-[11px] text-[13px] text-muted-foreground"><p className="min-w-0 flex-1">{t(section === "pinned" ? "pinnedEmpty" : section === "recent" ? "recentEmpty" : "empty")}</p>{section === "recent" && <Button variant="link" size="xs" className="h-auto px-0 text-brand-ink" onClick={openSearch}>{t("switcher")}</Button>}</div>}
        </section>;
      })}
    </div>
    <Dialog open={customizing} onOpenChange={setCustomizing}>
      <DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{t("customize")}</DialogTitle><DialogDescription>{t("customizeHint")}</DialogDescription></DialogHeader>
        <div className="divide-y divide-line-soft overflow-hidden rounded-xl border">{order.map((section, index) => <div key={section} className="flex items-center gap-2 px-3 py-1.5">
          <label className="flex min-h-9 flex-1 items-center gap-3 text-sm"><input type="checkbox" className="size-4 accent-brand" checked={!hidden.includes(section)} onChange={() => saveHidden(hidden.includes(section) ? hidden.filter((item) => item !== section) : [...hidden, section])} />{t(section)}</label>
          <Button size="icon-sm" variant="ghost" disabled={index === 0} aria-label={t("moveUp", { section: t(section) })} onClick={() => reorder(section, -1)}><ArrowUp /></Button>
          <Button size="icon-sm" variant="ghost" disabled={index === order.length - 1} aria-label={t("moveDown", { section: t(section) })} onClick={() => reorder(section, 1)}><ArrowDown /></Button>
        </div>)}</div>
        <label className="flex items-center gap-3 py-2 text-sm"><input type="checkbox" className="size-4 accent-brand" checked={compact} onChange={(event) => saveCompact(event.target.checked)} />{t("compact")}</label>
        <div className="flex justify-between border-t border-line-soft pt-4"><Button variant="ghost" onClick={() => { saveOrder(sections); saveHidden([]); saveCompact(false); }}>{t("reset")}</Button><Button onClick={() => setCustomizing(false)}>{t("done")}</Button></div>
      </DialogContent>
    </Dialog>
  </main>;
}
