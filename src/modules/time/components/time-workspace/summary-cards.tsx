"use client";

import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { PeriodSummary } from "../../lib/balance";
import { formatMinutes } from "./time-utils";

function Stat({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (
    <div className="min-w-0 px-3.5 py-3.5 shadow-[1px_0_0_var(--border),0_1px_0_var(--border)] first:pl-[18px]">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1.5 truncate text-[22px] leading-tight font-semibold tracking-[-0.02em] tabular-nums", negative && "text-late")}>{value}</p>
    </div>
  );
}

/** Week and month totals as one KPI card (design 1b): actual, target and balance per period. */
export function SummaryCards({ week, month, monthKey }: { week: PeriodSummary; month: PeriodSummary; monthKey: string }) {
  const t = useTranslations("time");
  const locale = useLocale();
  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${monthKey}-01T00:00:00Z`));
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-card">
      {[
        { title: t("summary.week"), summary: week },
        { title: `${t("summary.month")} · ${monthLabel}`, summary: month },
      ].map(({ title, summary }) => (
        <section key={title} aria-label={title} className="border-b border-line-soft last:border-b-0">
          <h2 className="px-[18px] pt-3.5 text-[11px] font-semibold tracking-[0.12em] text-text-tertiary uppercase">{title}</h2>
          <div className="grid grid-cols-3 overflow-hidden">
            <Stat label={t("summary.actual")} value={formatMinutes(summary.actualMinutes)} />
            <Stat label={t("summary.target")} value={summary.hasContract ? formatMinutes(summary.targetMinutes) : "—"} />
            <Stat
              label={t("summary.balance")}
              value={summary.hasContract ? formatMinutes(summary.balanceMinutes, true) : "—"}
              negative={summary.hasContract && summary.balanceMinutes < 0}
            />
          </div>
        </section>
      ))}
    </div>
  );
}
