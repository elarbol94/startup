"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { retryPdfProcessing } from "../pdf-actions";

export function PdfProcessingState({ sourceId, documentId, status, pageCount, progressPage, error }: { sourceId: string; documentId: string; status: string; pageCount: number; progressPage: number; error: string }) {
  const t = useTranslations("wiki"); const router = useRouter();
  useEffect(() => { if (status === "ready" || status === "failed") return; const timer = setInterval(() => router.refresh(), 2500); return () => clearInterval(timer); }, [router, status]);
  return <div className="grid min-h-[70vh] place-items-center p-6 text-center"><div className="w-full max-w-md rounded-xl border bg-card px-6 py-8 shadow-card"><span className={cn("mx-auto grid size-10 place-items-center rounded-xl", status === "failed" ? "bg-destructive/10 text-destructive" : "bg-brand-soft text-brand-ink")}>{status === "failed" ? <AlertCircle className="size-[18px]" /> : <Loader2 className="size-[18px] animate-spin" />}</span><h1 className="mt-3 text-[14.5px] font-semibold">{t(`pdfStatuses.${status}`)}</h1>{pageCount > 0 && <p className="mt-1 text-[13.5px] text-muted-foreground tabular-nums">{progressPage}/{pageCount}</p>}{error && <p className="mt-3 rounded-lg bg-destructive/10 p-3 text-[13px] text-destructive">{error}</p>}<div className="mt-5 flex justify-center gap-2"><Link className={buttonVariants({ variant: "outline" })} href={"/wiki/sources/" + sourceId}>{t("backToSource")}</Link>{status === "failed" && <Button onClick={async () => { await retryPdfProcessing(documentId); router.refresh(); }}><RefreshCw className="size-4" />{t("retry")}</Button>}</div></div></div>;
}
