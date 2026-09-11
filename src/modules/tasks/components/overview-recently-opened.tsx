"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Clock3, FileText, FileType2, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getRecentlyOpenedItems } from "@/modules/wiki/navigation-actions";
import { parseWikiList, useWikiLocalSetting } from "@/modules/wiki/components/wiki-navigation";
import type { RecentlyOpenedItem } from "@/modules/wiki/navigation-queries";

const icons = { document: FileText, pdf: FileType2, presentation: Presentation };
export function OverviewRecentlyOpened({ userId }: { userId: string }) {
  const t = useTranslations("overviewLayout");
  const [raw] = useWikiLocalSetting(`wiki-recent:${userId}`);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ raw: string | null; items: RecentlyOpenedItem[]; failed: boolean } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getRecentlyOpenedItems(parseWikiList(raw)).then(items => {
      if (!cancelled) setResult({ raw, items, failed: false });
    }).catch(() => { if (!cancelled) setResult({ raw, items: [], failed: true }); });
    return () => { cancelled = true; };
  }, [raw, retry]);
  const ready = result?.raw === raw;
  return <section className="flex h-full min-h-0 flex-col bg-card" aria-label={t("recentlyOpened")}>
    <header className="flex shrink-0 items-center gap-3 border-b px-4 py-4">
      <Clock3 className="size-4 text-muted-foreground" /><h2 className="text-sm font-semibold">{t("recentlyOpened")}</h2>
    </header>
    <p className="px-4 pt-3 text-xs text-muted-foreground">{t("recentHint")}</p>
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      {!ready ? <p role="status" className="p-3 text-sm text-muted-foreground">{t("recentLoading")}</p>
        : result.failed ? <div role="status" className="p-3 text-sm"><p>{t("recentFailed")}</p><Button variant="ghost" onClick={() => { setResult(null); setRetry(value => value + 1); }}>{t("recentRetry")}</Button></div>
        : !result.items.length ? <p className="p-3 text-sm text-muted-foreground">{t("recentEmpty")}</p>
        : <ul>{result.items.map(item => { const Icon = icons[item.kind]; return <li key={item.href}>
          <Link href={item.href} className="flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium" title={item.title}>{item.title}</span><span className="text-xs text-muted-foreground">{t(`recentKinds.${item.kind}`)}</span></span>
          </Link>
        </li>; })}</ul>}
    </div>
  </section>;
}
