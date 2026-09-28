"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, Download, FileText, History, MoreHorizontal, PanelRight, Plus, Save, Smartphone, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useTextPrompt } from "@/components/ui/text-prompt-dialog";
import { FocusModeToggle, useFocusMode } from "@/components/focus-mode";
import { ContextPanel } from "@/modules/context/components/context-panel";
import { createPage, deletePage, renamePage } from "../../actions";
import { toggleFavorite } from "../../research-actions";
import { saveOfficeCheckpoint } from "../../office/office-actions";
import { AttachmentPanel } from "../attachment-panel";
import { EvidencePanel } from "../evidence-panel";
import { InlinePageTitle } from "../inline-page-title";
import { OfficeConnectionsPanel } from "./office-connections-panel";
import { OfficeEditor, type OfficeEditorHandle } from "./office-editor";
import { OfficeSaveBadge } from "./office-save-badge";
import { OfficeVersionsDialog } from "./office-versions-dialog";
import { useOfficeStatus } from "./use-office-status";

type PageRef = { id: string; title: string; slug: string };

/** Page chrome for office (DOCX) documents: header, editor, workspace side panels. */
export function OfficeDocumentShell({ page, backlinks, favorite, attachments, query, converted = false }: {
  page: PageRef;
  /** Converted from the old editor: its last version stays readable. */
  converted?: boolean;
  backlinks: PageRef[];
  favorite: boolean;
  attachments: Array<{ id: string; fileName: string; mimeType: string; sizeBytes: number; uploadedBy: string }>;
  query: { insertEvidence?: string; task?: string; deadline?: string; officeAction?: string };
}) {
  const t = useTranslations("officeDocuments");
  const tWiki = useTranslations("wiki");
  const common = useTranslations("common");
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const editor = useRef<OfficeEditorHandle>(null);
  const [synced, setSynced] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [checkpointing, setCheckpointing] = useState(false);
  const [textPrompt, askText] = useTextPrompt();
  const currentSlug = useRef(page.slug);
  const { status, refresh } = useOfficeStatus(page.id, true);
  const { isFocused } = useFocusMode();

  async function rename(title: string) {
    const renamed = await renamePage(page.id, title);
    if (renamed.slug === currentSlug.current) { router.refresh(); return; }
    currentSlug.current = renamed.slug;
    window.history.replaceState(null, "", `/wiki/pages/${encodeURIComponent(renamed.slug)}${window.location.search}`);
  }

  const exportStored = (kind: "pdf" | "docx") => `/api/wiki/office/${encodeURIComponent(page.id)}/export?format=${kind}`;

  function exportLive(kind: "pdf" | "docx") {
    // The open editor converts its live state, so the export includes unsaved typing.
    if (editor.current?.downloadAs(kind)) return;
    const link = document.createElement("a");
    link.href = exportStored(kind);
    link.click();
  }

  async function checkpoint() {
    setCheckpointing(true);
    try {
      const result = await saveOfficeCheckpoint({ pageId: page.id });
      if (result.state === "done") toast.success(!result.stored ? t("checkpointBranch") : result.pdf ? t("checkpointStoredPdf") : t("checkpointStored"));
      else if (result.reason === "nothingNew") toast.info(t("checkpointNothingNew"));
      else toast.error(t("checkpointFailed"));
      void refresh();
    } finally {
      setCheckpointing(false);
    }
  }

  async function newSubpage() {
    const title = await askText({ title: tWiki("newSubpage"), label: tWiki("pageTitle"), required: true, maxLength: 200, confirmLabel: common("create") });
    if (!title) return;
    const child = await createPage({ title, parentId: page.id, proofingLanguage: locale === "en" ? "en-US" : "de-AT" });
    router.push("/wiki/pages/" + child.slug);
  }

  async function remove() {
    if (!confirm(common("confirmDeleteTitle"))) return;
    await deletePage(page.id);
    router.push("/wiki/inbox");
  }

  return <div className="mx-auto flex h-dvh max-w-[120rem] flex-col px-3 py-3 md:px-6">
    <header className="mb-2 flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-2">
      <div className="flex min-w-0 items-start gap-2">
        <Link href="/wiki" aria-label={tWiki("backToWikiStart")} title={tWiki("backToWikiStart")} className="mt-1 grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><ArrowLeft className="size-4" /></Link>
        <div className="min-w-0">
          <InlinePageTitle title={page.title} onRename={rename} />
          {status && !isFocused && <p className="mt-0.5 text-xs text-muted-foreground">{t("storedAt", { version: status.head.version, time: format.dateTime(new Date(status.head.storedAt), { dateStyle: "medium", timeStyle: "short" }) })}</p>}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <OfficeSaveBadge synced={synced} status={status} unavailable={unavailable} onOpenVersions={() => setVersionsOpen(true)} />
        <Button type="button" variant="ghost" size="sm" disabled={checkpointing || unavailable} onClick={() => void checkpoint()}><Save className="size-4" /><span className="hidden sm:inline">{t("checkpoint")}</span></Button>
        <Button type="button" variant={detailsOpen ? "secondary" : "ghost"} size="icon-sm" aria-pressed={detailsOpen} aria-label={t("details")} title={t("details")} onClick={() => setDetailsOpen((value) => !value)}><PanelRight className="size-4" /></Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" title={tWiki("editor.toolbar.more")} aria-label={tWiki("editor.toolbar.more")} />}><MoreHorizontal className="size-4" /></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem onClick={() => setVersionsOpen(true)}><History />{t("versions")}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => void newSubpage()}><Plus />{tWiki("newSubpage")}</DropdownMenuItem>
            <DropdownMenuItem onClick={async () => { await toggleFavorite("page", page.id); router.refresh(); }}><Star className={favorite ? "fill-indigo-400 text-indigo-500" : ""} />{tWiki("favorite")}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => exportLive("pdf")}><Download />{t("exportPdf")}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportLive("docx")}><FileText />{t("exportDocx")}</DropdownMenuItem>
            <DropdownMenuItem render={<a href={exportStored("pdf")} />}><Download />{t("exportStoredPdf")}</DropdownMenuItem>
            {converted && <DropdownMenuItem render={<a href={`/api/wiki/pages/${encodeURIComponent(page.id)}/export?format=html&disposition=inline`} target="_blank" rel="noopener" />}><History />{t("legacyVersion")}</DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => void remove()}><Trash2 />{tWiki("deletePage")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <FocusModeToggle compact />
      </div>
    </header>

    <p className="mb-2 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-xs text-muted-foreground md:hidden"><Smartphone className="size-3.5 shrink-0" />{t("mobileViewOnly")}</p>

    <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
      <main className="min-h-0">
        {unavailable
          ? <div className="grid h-full place-items-center rounded-md border p-6 text-center">
            <div className="max-w-md space-y-3">
              <p className="text-sm">{t("unavailable")}</p>
              <div className="flex justify-center gap-2">
                <a className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-accent" href={exportStored("docx")}><Download className="size-4" />DOCX</a>
                <a className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-accent" href={exportStored("pdf")}><Download className="size-4" />PDF</a>
              </div>
            </div>
          </div>
          : <OfficeEditor key={editorKey} ref={editor} page={page} query={query} onSynced={(value) => { setSynced(value); if (value) void refresh(); }} onUnavailable={() => setUnavailable(true)} />}
      </main>
      {detailsOpen && !isFocused && <aside data-testid="office-document-details" className="max-h-full w-full space-y-6 overflow-y-auto border-t pt-4 xl:w-80 xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0">
        <OfficeConnectionsPanel pageId={page.id} refreshKey={status?.head.id ?? 0} onSelect={(kind, id) => editor.current?.send({ command: "select", kind, id })} />
        <ContextPanel subjectType="wikiPage" subjectId={page.id} subjectLabel={page.title} subjectHref={`/wiki/pages/${page.slug}`} compact hideSources />
        <AttachmentPanel entityType="wikiPage" entityId={page.id} initial={attachments} />
        <EvidencePanel targetType="wikiPage" targetId={page.id} compact />
        {backlinks.length > 0 && <section><h2 className="mb-2 text-sm font-medium">{tWiki("backlinks")}</h2><div className="flex flex-wrap gap-2">{backlinks.map((item) => <Link key={item.id} href={`/wiki/pages/${item.slug}`} className="rounded-md border px-2 py-1 text-sm hover:bg-accent">{item.title}</Link>)}</div></section>}
      </aside>}
    </div>

    <OfficeVersionsDialog pageId={page.id} open={versionsOpen} onOpenChange={setVersionsOpen} onRestored={() => { setEditorKey((value) => value + 1); void refresh(); router.refresh(); }} />
    {textPrompt}
  </div>;
}
