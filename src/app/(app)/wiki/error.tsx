"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WIKI_PAGE_CLASS } from "@/modules/wiki/components/wiki-page-class";

export default function WikiError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("wiki");
  const common = useTranslations("common");
  return <div className={WIKI_PAGE_CLASS}>
    <div className="flex flex-col items-center gap-1.5 rounded-xl border bg-card px-6 py-10 text-center shadow-card">
      <span aria-hidden className="mb-1.5 grid size-10 place-items-center rounded-xl bg-destructive/10 text-destructive"><AlertTriangle className="size-[18px]" /></span>
      <h1 className="text-[14.5px] font-semibold">{common("error")}</h1>
      <p className="max-w-[360px] text-[13.5px] text-pretty text-muted-foreground">{t("errorDescription")}</p>
      {error.digest && <p className="font-mono text-[11px] text-muted-foreground">{error.digest}</p>}
      <div className="mt-2.5 flex justify-center gap-2">
        <Button onClick={reset}>{t("retry")}</Button>
        <Button variant="outline" render={<Link href="/wiki" />}>{t("backToWikiStart")}</Button>
      </div>
    </div>
  </div>;
}
