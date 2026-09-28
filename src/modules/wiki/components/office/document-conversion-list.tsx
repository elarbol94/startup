"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { convertDocumentToOffice } from "../../office/conversion-actions";

type Candidate = { id: string; title: string; slug: string; engine: string; updatedAt: number; converted: boolean };
type Outcome = { state: "running" } | { state: "done" } | { state: "failed"; detail: string };

/** Admin list: old-editor documents and their conversion to Word. */
export function DocumentConversionList({ documents }: { documents: Candidate[] }) {
  const t = useTranslations("settings.documents");
  const format = useFormatter();
  const router = useRouter();
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [busy, setBusy] = useState(false);
  const pending = documents.filter((document) => document.engine === "tiptap" && outcomes[document.id]?.state !== "done");

  async function convert(ids: string[]) {
    setBusy(true);
    try {
      // One at a time: each conversion locks its page and ends live editing.
      for (const id of ids) {
        setOutcomes((current) => ({ ...current, [id]: { state: "running" } }));
        const result = await convertDocumentToOffice({ pageId: id }).catch((error: unknown) => ({ ok: false as const, reason: "failed" as const, issues: [], message: String(error) }));
        setOutcomes((current) => ({ ...current, [id]: result.ok ? { state: "done" } : { state: "failed", detail: [...result.issues, result.message].filter(Boolean).join("; ") || t(`reasons.${result.reason}`) } }));
      }
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  function confirmAndConvert(ids: string[]) {
    if (confirm(t("confirm", { count: ids.length }))) void convert(ids);
  }

  if (!documents.length) return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  return <div className="space-y-4">
    <div className="rounded-lg border bg-muted/40 p-4 text-sm">{t("explanation")}</div>
    <div className="flex justify-end"><Button type="button" disabled={busy || !pending.length} onClick={() => confirmAndConvert(pending.map((document) => document.id))}>{t("convertAll", { count: pending.length })}</Button></div>
    <ul className="divide-y rounded-lg border">
      {documents.map((document) => {
        const outcome = outcomes[document.id];
        const office = document.engine !== "tiptap" || outcome?.state === "done";
        return <li key={document.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
          <div className="min-w-0 flex-1">
            <Link href={`/wiki/pages/${encodeURIComponent(document.slug)}`} className="font-medium hover:underline">{document.title}</Link>
            <p className="text-xs text-muted-foreground">{t("updated", { time: format.dateTime(new Date(document.updatedAt), { dateStyle: "medium", timeStyle: "short" }) })}</p>
            {outcome?.state === "failed" && <p className="mt-1 flex items-start gap-1 text-xs text-destructive"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" />{t("failed", { detail: outcome.detail })}</p>}
          </div>
          {outcome?.state === "running" ? <span className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />{t("running")}</span>
            : office ? <span className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="size-3.5" />{t(document.converted || outcome?.state === "done" ? "converted" : "word")}</span>
            : <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => confirmAndConvert([document.id])}>{t("convert")}</Button>}
        </li>;
      })}
    </ul>
  </div>;
}
