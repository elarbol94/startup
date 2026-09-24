"use client";

import { useLocale, useTranslations } from "next-intl";
import type { PeriodSummary } from "../../lib/balance";
import { formatMinutes } from "./time-utils";

function Stat({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  const color = tone === "positive" ? "text-emerald-700 dark:text-emerald-400" : tone === "negative" ? "text-amber-700 dark:text-amber-400" : "";
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

export function SummaryCards({ week, month, monthKey }: { week: PeriodSummary; month: PeriodSummary; monthKey: string }) {
  const t = useTranslations("time");
  const locale = useLocale();
  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${monthKey}-01T00:00:00Z`));
  const tone = (minutes: number) => (minutes > 0 ? "positive" : minutes < 0 ? "negative" : undefined);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {[
        { title: t("summary.week"), summary: week },
        { title: `${t("summary.month")} · ${monthLabel}`, summary: month },
      ].map(({ title, summary }) => (
        <section key={title} className="rounded-2xl border bg-card p-5 shadow-sm">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{title}</p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Stat label={t("summary.actual")} value={formatMinutes(summary.actualMinutes)} />
            <Stat label={t("summary.target")} value={summary.hasContract ? formatMinutes(summary.targetMinutes) : "—"} />
            <Stat
              label={t("summary.balance")}
              value={summary.hasContract ? formatMinutes(summary.balanceMinutes, true) : "—"}
              tone={summary.hasContract ? tone(summary.balanceMinutes) : undefined}
            />
          </div>
        </section>
      ))}
    </div>
  );
}
