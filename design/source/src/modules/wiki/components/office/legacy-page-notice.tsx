"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { convertDocumentToOffice } from "../../office/conversion-actions";

/**
 * A page still stored in the old editor's format (only possible after restoring
 * it from the trash). It is read-only: the old text opens as HTML, and an admin
 * can convert it to a Word document.
 */
export function LegacyPageNotice({ page, canConvert }: { page: { id: string; title: string }; canConvert: boolean }) {
  const t = useTranslations("officeDocuments.legacyPage");
  const router = useRouter();
  const [converting, setConverting] = useState(false);

  async function convert() {
    setConverting(true);
    try {
      const result = await convertDocumentToOffice({ pageId: page.id });
      if (result.ok) { toast.success(t("converted")); router.refresh(); }
      else toast.error(t("convertFailed", { detail: [...result.issues, result.message].filter(Boolean).join("; ") || result.reason }));
    } catch {
      toast.error(t("convertFailed", { detail: "" }));
    } finally {
      setConverting(false);
    }
  }

  return <div className="mx-auto max-w-2xl space-y-4 p-8">
    <Link href="/wiki/pages" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />{t("back")}</Link>
    <h1 className="text-2xl font-semibold">{page.title}</h1>
    <div className="space-y-3 rounded-lg border bg-muted/40 p-4 text-sm">
      <p>{t("description")}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" render={<a href={`/api/wiki/pages/${encodeURIComponent(page.id)}/export?format=html&disposition=inline`} target="_blank" rel="noopener" />}><FileText className="size-4" />{t("open")}</Button>
        {canConvert
          ? <Button size="sm" disabled={converting} onClick={() => void convert()}>{converting && <Loader2 className="size-4 animate-spin" />}{t("convert")}</Button>
          : <p className="self-center text-xs text-muted-foreground">{t("adminOnly")}</p>}
      </div>
    </div>
  </div>;
}
