"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Download, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { restoreOfficeVersion } from "../../office/office-actions";
import type { OfficeVersionRow } from "../../office/queries";

/** Stored office versions: download any of them, or restore one as the new head. */
export function OfficeVersionsDialog({ pageId, open, onOpenChange, onRestored }: {
  pageId: string; open: boolean; onOpenChange: (open: boolean) => void; onRestored: () => void;
}) {
  const t = useTranslations("officeDocuments");
  const format = useFormatter();
  const [versions, setVersions] = useState<OfficeVersionRow[] | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetch(`/api/wiki/office/${encodeURIComponent(pageId)}/versions`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<{ versions: OfficeVersionRow[] }> : { versions: [] })
      .then((result) => { if (!cancelled) setVersions(result.versions); });
    return () => { cancelled = true; setVersions(null); };
  }, [open, pageId]);

  async function restore(version: OfficeVersionRow) {
    if (!confirm(t("restoreConfirm", { version: version.version }))) return;
    setRestoring(version.id);
    try {
      const result = await restoreOfficeVersion({ pageId, versionId: version.id });
      if (result.state === "done") { toast.success(t("restored")); onOpenChange(false); onRestored(); }
      else toast.error(t(`restoreFailed.${result.reason ?? "timeout"}`));
    } catch {
      toast.error(t("restoreFailed.timeout"));
    } finally {
      setRestoring(null);
    }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[85dvh] overflow-hidden sm:max-w-xl">
      <DialogHeader><DialogTitle>{t("versions")}</DialogTitle><DialogDescription>{t("versionsDescription")}</DialogDescription></DialogHeader>
      {!versions ? <div className="grid place-items-center py-10"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        : <ul className="max-h-[60dvh] space-y-1 overflow-y-auto pr-1">
          {versions.map((version, index) => <li key={version.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium">v{version.version} · {t(`versionKinds.${version.kind}`)}{index === 0 && version.kind !== "branch" ? ` · ${t("current")}` : ""}</p>
              <p className="text-xs text-muted-foreground">{version.authorName ?? t("unknownAuthor")} · {format.dateTime(new Date(version.createdAt), { dateStyle: "medium", timeStyle: "short" })}</p>
            </div>
            <a className="inline-flex size-8 items-center justify-center rounded-md hover:bg-accent" href={`/api/wiki/office/${encodeURIComponent(pageId)}/export?format=docx&version=${encodeURIComponent(version.id)}`} aria-label={t("downloadVersion")} title={t("downloadVersion")}><Download className="size-4" /></a>
            <Button type="button" size="icon-sm" variant="ghost" aria-label={t("restore")} title={t("restore")} disabled={restoring !== null} onClick={() => void restore(version)}>
              {restoring === version.id ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
            </Button>
          </li>)}
        </ul>}
    </DialogContent>
  </Dialog>;
}
