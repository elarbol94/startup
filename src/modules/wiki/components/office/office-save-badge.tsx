"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, CloudOff, Loader2, RotateCcw } from "lucide-react";
import type { OfficeStatus } from "../../office/queries";

/**
 * Two states on purpose: "synced" means the document server has the edits;
 * "stored" means the app committed a DOCX version (head).
 */
export function OfficeSaveBadge({ synced, status, unavailable, onOpenVersions }: {
  synced: boolean; status: OfficeStatus | null; unavailable: boolean; onOpenVersions: () => void;
}) {
  const t = useTranslations("officeDocuments");
  if (unavailable) return <span className="flex items-center gap-1 text-xs text-muted-foreground"><CloudOff className="size-3.5" />{t("offline")}</span>;
  if (status?.session?.lastError) return <span role="status" className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300"><AlertTriangle className="size-3.5" />{t("storeError")}</span>;
  if (status?.recoveredVersionId) return <button type="button" onClick={onOpenVersions} className="flex items-center gap-1 rounded-md px-1 text-xs text-amber-700 hover:bg-accent dark:text-amber-300"><RotateCcw className="size-3.5" />{t("recoveredChanges")}</button>;
  return <span role="status" className="flex items-center gap-1 text-xs text-muted-foreground" title={t("storedHint")}>
    {synced ? <CheckCircle2 className="size-3.5 text-emerald-600" /> : <Loader2 className="size-3.5 animate-spin" />}
    {synced ? t("synced") : t("syncing")}
  </span>;
}
