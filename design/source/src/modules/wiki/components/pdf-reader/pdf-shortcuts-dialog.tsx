"use client";

// Keyboard shortcut settings dialog of the PDF reader: lists every action and records,
// validates and resets bindings. Used by pdf-reader.tsx.
import { useState, type Dispatch, type SetStateAction } from "react";
import type { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DEFAULT_PDF_SHORTCUT_BINDINGS, isReservedPdfShortcut, normalizePdfShortcut, PDF_SHORTCUT_GROUPS,
  shortcutConflicts, type PdfShortcutAction, type PdfShortcutBindings,
} from "../../lib/pdf-shortcuts";

export function PdfShortcutsDialog({
  t, shortcutsOpen, setShortcutsOpen, shortcuts, setShortcuts, showShortcut, shortcutActionLabel,
}: {
  t: ReturnType<typeof useTranslations<"wiki">>;
  shortcutsOpen: boolean;
  setShortcutsOpen: Dispatch<SetStateAction<boolean>>;
  shortcuts: PdfShortcutBindings;
  setShortcuts: Dispatch<SetStateAction<PdfShortcutBindings>>;
  showShortcut: (binding: string) => string;
  shortcutActionLabel: (action: PdfShortcutAction) => string;
}) {
  const [recordingShortcut, setRecordingShortcut] = useState<PdfShortcutAction | null>(null);
  const [shortcutError, setShortcutError] = useState("");

  function captureShortcut(action: PdfShortcutAction, event: React.KeyboardEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const shortcut = event.key === "Tab" && (action === "previousMatch" || action === "nextMatch")
      ? `${event.shiftKey ? "Shift+" : ""}Tab`
      : normalizePdfShortcut(event);
    if (!shortcut) { setShortcutError(t("shortcutRequiresCtrl")); return; }
    if (isReservedPdfShortcut(shortcut)) { setShortcutError(t("shortcutReserved")); return; }
    const conflict = shortcutConflicts(shortcuts, action, shortcut);
    if (conflict) { setShortcutError(t("shortcutConflict", { action: shortcutActionLabel(conflict) })); return; }
    setShortcuts((current) => ({ ...current, [action]: shortcut }));
    setRecordingShortcut(null);
    setShortcutError("");
  }

  return <Dialog open={shortcutsOpen} onOpenChange={(open) => { setShortcutsOpen(open); if (!open) { setRecordingShortcut(null); setShortcutError(""); } }}><DialogContent className="max-h-[min(80dvh,44rem)] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{t("keyboardShortcuts")}</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">{t("shortcutDialogHint")}</p>{shortcutError && <p role="alert" className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{shortcutError}</p>}<div className="space-y-4">{PDF_SHORTCUT_GROUPS.map((group) => <section key={group.label} className="overflow-hidden rounded-lg border"><h3 className="border-b bg-muted/40 px-3 py-2 text-xs font-semibold">{t(`pdfShortcuts.groups.${group.label}`)}</h3><div className="divide-y">{group.actions.map((action) => <div key={action} className="flex items-center justify-between gap-3 p-2"><span className="min-w-0 truncate text-sm">{shortcutActionLabel(action)}</span><div className="flex shrink-0 items-center gap-1"><Button type="button" variant={recordingShortcut === action ? "secondary" : "outline"} size="sm" className="font-mono text-xs" onClick={() => { setRecordingShortcut(action); setShortcutError(""); }} onKeyDown={(event) => { if (recordingShortcut === action) captureShortcut(action, event); }}>{recordingShortcut === action ? t("shortcutRecording") : showShortcut(shortcuts[action])}</Button><Button type="button" variant="ghost" size="xs" disabled={shortcuts[action] === DEFAULT_PDF_SHORTCUT_BINDINGS[action]} aria-label={t("resetShortcut", { action: shortcutActionLabel(action) })} onClick={() => { setShortcuts((current) => ({ ...current, [action]: DEFAULT_PDF_SHORTCUT_BINDINGS[action] })); setRecordingShortcut(null); setShortcutError(""); }}>{t("resetShortcut")}</Button></div></div>)}</div></section>)}</div><DialogFooter><Button type="button" variant="outline" onClick={() => { setShortcuts(DEFAULT_PDF_SHORTCUT_BINDINGS); setRecordingShortcut(null); setShortcutError(""); }}>{t("resetShortcuts")}</Button><Button type="button" onClick={() => setShortcutsOpen(false)}>{t("done")}</Button></DialogFooter></DialogContent></Dialog>
}
