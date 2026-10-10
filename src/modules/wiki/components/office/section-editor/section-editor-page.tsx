"use client";

import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft, Check, ExternalLink, Loader2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OfficeEditor, type OfficeEditorHandle } from "../office-editor";
import type { OfficeCommand } from "../use-office-bridge";
import { useFitToViewport } from "../use-fit-to-viewport";
import { useSectionTab } from "./use-section-tab";

/**
 * Section tab of "Abschnitt separat bearbeiten": its own platform page with a
 * second editor on a scratch document that holds only the section. The
 * content comes from (and goes back to) the main document tab; see
 * use-section-tab.ts.
 */
export function SectionEditorPage({ page, lockId }: { page: { id: string; slug: string; title: string }; lockId: string }) {
  const t = useTranslations("officeDocuments.sectionEditor");
  const editor = useRef<OfficeEditorHandle>(null);
  const send = useCallback((command: OfficeCommand) => editor.current?.send(command), []);
  const documentPath = `/wiki/pages/${encodeURIComponent(page.slug)}`;
  const tab = useSectionTab(page.id, lockId, documentPath, send);
  const root = useFitToViewport();
  const sectionTitle = tab.state.kind === "editing" ? tab.state.title ?? t("startOfDocument") : null;
  const tabTitle = t("tabTitle", { section: sectionTitle ?? t("heading"), document: page.title });
  useEffect(() => { document.title = tabTitle; }, [tabTitle]);

  const backLink = <Link href={documentPath} className="inline-flex items-center gap-1 text-sm underline-offset-2 hover:underline"><ArrowLeft className="size-4" />{t("backToDocument", { title: page.title })}</Link>;

  if (tab.state.kind !== "editing" || tab.finished) {
    const message = tab.finished && tab.state.kind === "editing" ? t("closing")
      : tab.state.kind === "connecting" ? t("connecting")
        : tab.state.kind === "busy" ? t("busy")
          : tab.state.kind === "closed" ? t("closedState")
            : t("orphan");
    // Same root element as the editor view: useFitToViewport measures it once, on mount.
    return <div ref={root} className="mx-auto flex max-w-[120rem] flex-col px-3 py-3 md:px-6">
      <div className="mx-auto w-full max-w-lg space-y-3 p-6" data-testid="office-section-tab-state">
        <h1 className="text-lg font-semibold">{t("heading")}</h1>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">{tab.state.kind === "connecting" && <Loader2 className="size-4 animate-spin" />}{message}</p>
        {tab.state.kind !== "connecting" && backLink}
      </div>
    </div>;
  }

  const applying = tab.apply === "applying";
  return <div ref={root} className="mx-auto flex h-dvh max-w-[120rem] flex-col gap-2 px-3 py-3 md:px-6" data-testid="office-section-editor">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-2">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold">{sectionTitle}</h1>
        <p className="text-xs text-muted-foreground">{t("description")}</p>
        <div className="mt-1 text-xs">{backLink}</div>
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" disabled={applying} onClick={tab.discard}><Undo2 className="size-4" />{t("discard")}</Button>
        <Button type="button" disabled={!tab.loaded || applying} onClick={tab.startApply}>
          {applying ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}{t("apply")}
        </Button>
      </div>
    </header>
    {tab.apply === "noMain" && <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm">
      <span className="min-w-0 flex-1">{t("noMain")}</span>
      <Button type="button" size="sm" variant="outline" onClick={() => window.open(documentPath, "_blank")}><ExternalLink className="size-4" />{t("openDocument")}</Button>
      <Button type="button" size="sm" variant="ghost" onClick={tab.retryApply}>{t("retry")}</Button>
    </div>}
    <div className="min-h-0 flex-1">
      <OfficeEditor ref={editor} page={page} variant="section" onPluginEvent={tab.onPluginEvent} />
    </div>
  </div>;
}
