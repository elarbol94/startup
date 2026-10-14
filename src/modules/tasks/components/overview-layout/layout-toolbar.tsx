"use client";
import { useTranslations } from "next-intl";
import { Eye, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OverviewCardId } from "../../overview-layout";

/** Edit-mode bar: what to do, the hidden cards to bring back, and a reset. */
export function LayoutToolbar({
  hidden,
  saveFailed,
  onShow,
  onReset,
}: {
  hidden: OverviewCardId[];
  saveFailed: boolean;
  onShow: (id: OverviewCardId) => void;
  onReset: () => void;
}) {
  const t = useTranslations("overviewLayout");
  return (
    <section aria-label={t("customize")} className="flex flex-col gap-3 rounded-xl border border-dashed bg-muted/30 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t("hint")}</p>
        <Button variant="ghost" size="sm" onClick={onReset}>
          <RotateCcw />
          {t("reset")}
        </Button>
      </div>
      {hidden.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">{t("hiddenCards")}</span>
          {hidden.map((id) => (
            <Button key={id} variant="outline" size="sm" onClick={() => onShow(id)} aria-label={t("show", { section: t(id) })}>
              <Eye />
              {t(id)}
            </Button>
          ))}
        </div>
      )}
      {saveFailed && <p role="status" className="text-sm text-destructive">{t("saveFailed")}</p>}
    </section>
  );
}
