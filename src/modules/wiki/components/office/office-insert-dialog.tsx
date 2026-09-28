"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type InsertKind = "cite" | "evidence" | "link";

type Source = { id: string; title: string; year: string; authors: string };
export type EvidenceItem = { id: string; selectedText: string; label: string; sourceTitle: string; pageNumber: number; href: string };
export type PageItem = { title: string; slug: string; href: string };

export type InsertResult =
  | { kind: "cite"; ids: string[]; loc?: string }
  | { kind: "evidence"; item: EvidenceItem }
  | { kind: "link"; page: PageItem };

type Item = { key: string; title: string; detail: string; value: Source | EvidenceItem | PageItem };

async function search(kind: InsertKind, pageId: string, query: string): Promise<Item[]> {
  const q = encodeURIComponent(query);
  if (kind === "cite") {
    const result = await (await fetch(`/api/wiki/office/citations?page=${encodeURIComponent(pageId)}&q=${q}`)).json() as { sources: Source[] };
    return result.sources.map((source) => ({ key: source.id, title: source.title, detail: [source.authors, source.year].filter(Boolean).join(" · "), value: source }));
  }
  if (kind === "evidence") {
    const result = await (await fetch(`/api/wiki/office/evidence?q=${q}`)).json() as { items: EvidenceItem[] };
    return result.items.map((item) => ({ key: item.id, title: item.selectedText || item.label || item.sourceTitle, detail: `${item.sourceTitle} · S. ${item.pageNumber}`, value: item }));
  }
  if (!query.trim()) return [];
  const result = await (await fetch(`/api/wiki/office/pages?q=${q}`)).json() as { pages: PageItem[] };
  return result.pages.map((page) => ({ key: page.slug, title: page.title, detail: page.slug, value: page }));
}

/**
 * The app-side pickers behind the editor's "Workspace" toolbar buttons.
 * Citations allow several sources and a locator; evidence and links insert on click.
 */
export function OfficeInsertDialog({ pageId, kind, onClose, onInsert }: {
  pageId: string; kind: InsertKind | null; onClose: () => void; onInsert: (result: InsertResult) => void;
}) {
  const t = useTranslations("officeDocuments.insert");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [locator, setLocator] = useState("");

  useEffect(() => {
    if (!kind) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void search(kind, pageId, query).then((next) => { if (!cancelled) setItems(next); }, () => { if (!cancelled) setItems([]); });
    }, 200);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [kind, pageId, query]);

  function close() {
    setQuery(""); setItems(null); setSelected([]); setLocator("");
    onClose();
  }

  function pick(item: Item) {
    if (kind === "cite") {
      setSelected((current) => current.includes(item.key) ? current.filter((key) => key !== item.key) : [...current, item.key]);
      return;
    }
    onInsert(kind === "evidence" ? { kind: "evidence", item: item.value as EvidenceItem } : { kind: "link", page: item.value as PageItem });
    close();
  }

  return <Dialog open={kind !== null} onOpenChange={(open) => { if (!open) close(); }}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{kind ? t(`${kind}.title`) : ""}</DialogTitle>
        <DialogDescription>{kind ? t(`${kind}.description`) : ""}</DialogDescription>
      </DialogHeader>
      <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={kind ? t(`${kind}.search`) : ""} aria-label={kind ? t(`${kind}.search`) : ""} />
      <ul className="max-h-80 space-y-1 overflow-y-auto" aria-label={t("results")}>
        {items === null && <li className="grid place-items-center py-6"><Loader2 className="size-4 animate-spin text-muted-foreground" /></li>}
        {items?.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">{kind === "link" && !query.trim() ? t("typeToSearch") : t("empty")}</li>}
        {items?.map((item) => {
          const active = selected.includes(item.key);
          return <li key={item.key}>
            <button type="button" onClick={() => pick(item)} aria-pressed={kind === "cite" ? active : undefined}
              className={`flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent ${active ? "bg-accent" : ""}`}>
              {kind === "cite" && <Check className={`mt-0.5 size-4 shrink-0 ${active ? "text-primary" : "text-transparent"}`} />}
              <span className="min-w-0"><span className="line-clamp-2 font-medium">{item.title}</span>{item.detail && <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>}</span>
            </button>
          </li>;
        })}
      </ul>
      {kind === "cite" && <>
        <Input value={locator} maxLength={120} onChange={(event) => setLocator(event.target.value)} placeholder={t("cite.locator")} aria-label={t("cite.locator")} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>{t("cancel")}</Button>
          <Button type="button" disabled={!selected.length} onClick={() => { onInsert({ kind: "cite", ids: selected.slice(0, 50), ...(locator.trim() ? { loc: locator.trim() } : {}) }); close(); }}>{t("cite.insert", { count: selected.length })}</Button>
        </DialogFooter>
      </>}
    </DialogContent>
  </Dialog>;
}
