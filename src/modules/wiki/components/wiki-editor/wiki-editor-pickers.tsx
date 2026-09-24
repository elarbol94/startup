"use client";
// Toolbar popovers that insert a wiki page link, a citation or a PDF evidence block into the
// wiki editor. Used by wiki-editor.tsx.
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { Editor } from "@tiptap/react";
import { BookMarked, Highlighter, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { applyEditorLink } from "../../lib/editor-link";
import { formatInlineCitation } from "../../lib/citations";
import { NewSourceDialog } from "../new-source-dialog";
import { citationNumberForSource, evidenceInsertContent } from "./wiki-editor-document-ops";
import type { EvidenceRef, PageRef, SourceRef } from "./wiki-editor-types";

export function PageLinkPicker({ editor, pages, open, onOpenChange }: { editor: Editor; pages: PageRef[]; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("wiki"); const [query, setQuery] = useState("");
  return <Popover open={open} onOpenChange={onOpenChange}><PopoverTrigger render={<Button type="button" variant="ghost" size="icon-sm" title={t("linkPage")} aria-label={t("linkPage")} />}><Link2 className="size-4" /></PopoverTrigger><PopoverContent finalFocus={() => editor.isDestroyed ? false : editor.view.dom} className="w-72 p-2"><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("filterPages")} className="mb-2 h-8" /><div className="max-h-60 overflow-y-auto">{pages.filter((page) => page.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map((page) => <button key={page.id} type="button" className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => { const href = `/wiki/pages/${page.slug}`; applyEditorLink(editor, href, page.title); onOpenChange(false); }}>{page.title}</button>)}</div></PopoverContent></Popover>;
}

export function CitationPicker({ editor, sources, locale, pageSlug, open, onOpenChange }: { editor: Editor; sources: SourceRef[]; locale: string; pageSlug: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("wiki"); const [query, setQuery] = useState(""); const [locator, setLocator] = useState("");
  function preview(source: SourceRef) { return formatInlineCitation(source, locator, locale, citationNumberForSource(editor, source.id)); }
  function insert(source: SourceRef) { const label = preview(source); editor.chain().focus().insertContent({ type: "citation", attrs: { items: [{ sourceId: source.id, locator: locator || undefined, locatorType: "page" }], label } }).run(); onOpenChange(false); setLocator(""); setQuery(""); }
  const filtered = sources.filter((source) => `${source.title} ${source.contributors.map((person) => `${person.given} ${person.family} ${person.literal}`).join(" ")}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <Popover open={open} onOpenChange={onOpenChange}><PopoverTrigger render={<Button type="button" variant="ghost" size="sm" className="gap-1.5 px-2 text-xs" title={t("citeSource")} aria-label={t("citeSource")} />}><BookMarked className="size-4" /><span className="hidden 2xl:inline">{t("citeSource")}</span></PopoverTrigger><PopoverContent className="w-96 p-2"><div className="grid grid-cols-[1fr_5rem] gap-2"><Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("findSource")} className="h-8" /><Input value={locator} onChange={(event) => setLocator(event.target.value)} placeholder={t("pageShort")} className="h-8" /></div><div className="mt-2 max-h-64 overflow-y-auto">{filtered.map((source) => <button key={source.id} type="button" className="block w-full rounded px-2 py-2 text-left hover:bg-accent" onClick={() => insert(source)}><span className="block text-sm font-medium">{source.title}</span><span className="text-xs text-muted-foreground">{preview(source)}</span></button>)}</div><div className="mt-2 flex items-center justify-between border-t pt-2"><span className="text-[11px] text-muted-foreground">IEEE</span><NewSourceDialog compactButton redirectTo={`/wiki/pages/${pageSlug}`} /></div></PopoverContent></Popover>;
}

export function EvidencePicker({ editor, pageId, locale, open, onOpenChange }: { editor: Editor; pageId: string; locale: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("wiki");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<EvidenceRef[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRequest = useRef(0);

  async function load(search = "") {
    const request = ++searchRequest.current;
    setLoading(true);
    try {
      const response = await fetch(`/api/wiki/evidence?targetType=wikiPage&targetId=${encodeURIComponent(pageId)}&q=${encodeURIComponent(search)}`);
      if (response.ok) {
        const body = await response.json() as { available: EvidenceRef[] };
        // A slower earlier request must not overwrite a newer result.
        if (searchRequest.current === request) setItems(body.available);
      }
    } finally {
      if (searchRequest.current === request) setLoading(false);
    }
  }

  /** Debounced like every other search in the module, instead of waiting for a button. */
  function updateQuery(value: string) {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void load(value);
    }, 220);
  }

  function searchNow() {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    void load(query);
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function insert(item: EvidenceRef) {
    editor.chain().focus().insertContent(evidenceInsertContent(item, locale)).run();
    onOpenChange(false);
    setQuery("");
  }

  return (
    <Popover open={open} onOpenChange={(value) => { onOpenChange(value); if (value) void load(); }}>
      <PopoverTrigger render={<Button type="button" variant="ghost" size="icon-sm" title={t("insertPdfEvidence")} aria-label={t("insertPdfEvidence")} />}>
        <Highlighter className="size-4 text-indigo-600" />
      </PopoverTrigger>
      <PopoverContent className="w-96 p-2">
        <div className="flex gap-2">
          <Input autoFocus value={query} onChange={(event) => updateQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); searchNow(); } }} placeholder={t("findEvidence")} className="h-8" />
        </div>
        <div className="mt-2 max-h-72 overflow-y-auto">
          {loading ? <p className="p-3 text-sm text-muted-foreground">{t("loading")}</p> : items.length === 0 ? <p className="p-3 text-sm text-muted-foreground">{t("noEvidenceAvailable")}</p> : items.map((item) => (
            <button key={item.id} type="button" className="block w-full rounded px-2 py-2 text-left hover:bg-accent" onClick={() => insert(item)}>
              <span className="block text-sm font-medium">{item.label || item.sourceTitle} · {t("pageNumber", { page: item.pageNumber })}</span>
              {item.selectedText && <span className="mt-1 line-clamp-3 block text-xs italic text-muted-foreground">“{item.selectedText}”</span>}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
