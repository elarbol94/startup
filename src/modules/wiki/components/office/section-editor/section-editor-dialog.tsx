"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OfficeEditor, type OfficeEditorHandle } from "../office-editor";
import type { PluginEvent } from "../use-office-bridge";
import type { SectionSession } from "./use-section-editor";

/**
 * Large dialog with a second editor on a scratch document that holds only the
 * section. "Übernehmen und schließen" reads it back and hands it to the main
 * document; "Verwerfen" leaves the section unchanged. Mount it with
 * `key={session.id}` so every section starts fresh.
 */
export function SectionEditorDialog({ page, session, onSaving, onApply, onDiscard, onLoadFailed }: {
  page: { id: string; slug: string; title: string };
  session: SectionSession;
  onSaving: () => void;
  onApply: (json: string) => void;
  onDiscard: () => void;
  onLoadFailed: () => void;
}) {
  const t = useTranslations("officeDocuments.sectionEditor");
  const editor = useRef<OfficeEditorHandle>(null);
  const [loaded, setLoaded] = useState(false);
  const { json } = session;

  const onPluginEvent = useCallback((event: PluginEvent) => {
    if (event.type === "ready") editor.current?.send({ command: "loadSection", json });
    else if (event.type === "sectionLoaded") { if (event.ok) setLoaded(true); else onLoadFailed(); }
    else if (event.type === "sectionContent") onApply(event.json);
  }, [json, onApply, onLoadFailed]);

  function apply() {
    onSaving();
    editor.current?.send({ command: "readSection" });
  }

  function discard() {
    if (window.confirm(t("discardConfirm"))) onDiscard();
  }

  // Closing only through the buttons: escape, outside clicks and focus changes keep it open.
  return <Dialog open modal={false} disablePointerDismissal onOpenChange={() => {}}>
    <DialogContent
      showCloseButton={false}
      data-testid="office-section-editor"
      className="flex h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] flex-col gap-3 overflow-hidden sm:max-w-[calc(100vw-2rem)] 2xl:max-w-[110rem]"
    >
      <DialogHeader>
        <DialogTitle className="truncate">{session.title ?? t("startOfDocument")}</DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 flex-1">
        <OfficeEditor ref={editor} page={page} variant="section" onPluginEvent={onPluginEvent} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" disabled={session.saving} onClick={discard}><Undo2 className="size-4" />{t("discard")}</Button>
        <Button type="button" disabled={!loaded || session.saving} onClick={apply}>
          {session.saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}{t("apply")}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
