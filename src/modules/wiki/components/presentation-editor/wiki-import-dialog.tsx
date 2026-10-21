"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { searchWikiNavigation } from "../../navigation-actions";
import { getWikiPageOutline } from "../../presentation-wiki-import-actions";
import type { WikiOutlineSection } from "../../lib/presentation-wiki-import";

type PageHit = { href: string; title: string };
type Outline = { href: string; title: string; sections: WikiOutlineSection[] };

/** Two steps in one dialog: find a wiki page, then pick the section that fills the detail page. */
export function WikiImportDialog({ open, onOpenChange, onImport }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (section: WikiOutlineSection) => void;
}) {
  const t = useTranslations("wiki.presentations.details");
  const [query, setQuery] = useState("");
  const [pages, setPages] = useState<PageHit[] | null>(null);
  const [outline, setOutline] = useState<Outline | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || outline) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      searchWikiNavigation(query).then((items) => {
        if (cancelled) return;
        const seen = new Set<string>();
        setPages(items.filter((item) => item.kind === "document" && item.href.startsWith("/wiki/pages/") && !seen.has(item.href) && seen.add(item.href))
          .slice(0, 30).map((item) => ({ href: item.href, title: item.title })));
      }).catch(() => { if (!cancelled) setPages([]); });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, outline, query]);

  const choose = async (page: PageHit) => {
    setLoading(page.href); setFailed(false);
    try { setOutline({ href: page.href, ...await getWikiPageOutline({ href: page.href }) }); }
    catch { setFailed(true); }
    finally { setLoading(null); }
  };
  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) { setOutline(null); setFailed(false); }
  };

  return <Dialog open={open} onOpenChange={close}>
    <DialogContent className="max-h-[85dvh] overflow-hidden sm:max-w-lg" data-testid="wiki-import-dialog">
      <DialogHeader>
        <DialogTitle>{t("importTitle")}</DialogTitle>
        <DialogDescription>{t("importDescription")}</DialogDescription>
      </DialogHeader>
      {outline ? <div className="flex min-h-0 flex-col gap-2">
        <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setOutline(null)}><ArrowLeft className="size-4" />{t("otherPage")}</Button>
        <p className="truncate text-sm font-medium">{outline.title}</p>
        {outline.sections.length === 0 && <p className="text-sm text-muted-foreground">{t("noSections")}</p>}
        <ul className="max-h-[50dvh] space-y-0.5 overflow-y-auto">
          {outline.sections.map((section) => <li key={section.id}>
            <button type="button" className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted" style={{ paddingLeft: `${0.5 + Math.max(0, section.level - 1) * 0.9}rem` }}
              onClick={() => { onImport(section); close(false); }}>
              <span className="block truncate font-medium">{section.title || t("intro")}</span>
              {section.lines[0] && <span className="block truncate text-xs text-muted-foreground">{section.lines[0]}</span>}
            </button>
          </li>)}
        </ul>
      </div> : <div className="flex min-h-0 flex-col gap-2">
        <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("search")} aria-label={t("search")} />
        {failed && <p role="alert" className="text-sm text-destructive">{t("loadFailed")}</p>}
        {pages === null ? <p className="text-sm text-muted-foreground">{t("loading")}</p>
          : pages.length === 0 ? <p className="text-sm text-muted-foreground">{t("noPages")}</p>
            : <ul className="max-h-[50dvh] space-y-0.5 overflow-y-auto">
              {pages.map((page) => <li key={page.href}>
                <button type="button" disabled={loading !== null} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-60" onClick={() => void choose(page)}>
                  {loading === page.href ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <FileText className="size-4 shrink-0 text-muted-foreground" />}
                  <span className="truncate">{page.title}</span>
                </button>
              </li>)}
            </ul>}
      </div>}
    </DialogContent>
  </Dialog>;
}
