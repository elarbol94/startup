"use client";

import { BadgeEuro, CheckCircle2, CircleAlert, Sparkles } from "lucide-react";
import { UserAttribution } from "@/components/user-identity";
import { Button } from "@/components/ui/button";
import type { PersonnelWorkspaceData } from "../../queries";
import { activatePersonnelScenario } from "../../actions";
import type { calculateAnnualPersonnelCost } from "../../lib/engine";
import type { Text } from "./personnel-copy";
import { Panel, PanelHeader, Pill } from "./personnel-ui";
import { euro, type PanelProps } from "./personnel-utils";

export function ScenariosPanel({ data, t, locale, pending, run, currentAnnual }: PanelProps & { currentAnnual: ReturnType<typeof calculateAnnualPersonnelCost> | null }) {
  return <Panel>
    <PanelHeader title={t.saveScenario} meta={data.scenarios.length} />
    {data.scenarios.length ? <ul className="divide-y divide-line-soft">{data.scenarios.map((scenario) => {
      const result = scenario.resultJson as { annualEmployerCostCents?: number; directHourlyRateCents?: number };
      const delta = currentAnnual && result.annualEmployerCostCents ? result.annualEmployerCostCents - currentAnnual.annualEmployerCostCents : null;
      return <li key={scenario.id} className="grid items-center gap-x-4 gap-y-2 px-[18px] py-[11px] text-[13.5px] transition-colors hover:bg-accent sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
        <span aria-hidden className="hidden size-8 place-items-center rounded-lg bg-brand-soft text-brand-ink sm:grid"><Sparkles className="size-4" /></span>
        <div className="min-w-0">
          <p className="truncate font-medium">{scenario.name}</p>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground"><span>{scenario.ruleVersion} · {scenario.planningYear}</span><UserAttribution userId={scenario.createdBy} relation="createdBy" /></p>
        </div>
        <div className="sm:text-right">
          <p className="font-semibold tabular-nums">{euro(result.annualEmployerCostCents ?? 0, locale)}</p>
          {delta !== null && <p className={`text-xs tabular-nums ${delta > 0 ? "text-late" : "text-muted-foreground"}`}>{delta > 0 ? "+" : ""}{euro(delta, locale)} {t.liveComparison}</p>}
        </div>
        <div className="sm:w-48 sm:text-right">
          {scenario.employeeId && <Button size="sm" variant="outline" className="w-full sm:w-auto" disabled={pending} onClick={() => run(() => activatePersonnelScenario(scenario.id), t.scenarioActivated)}><CheckCircle2 className="size-3.5" />{t.activate}</Button>}
        </div>
      </li>;
    })}</ul> : null}
  </Panel>;
}

export function RulesPanel({ data, t }: { data: PersonnelWorkspaceData; t: Text }) {
  return <Panel>
    <PanelHeader title="AT 2025–2027" meta={t.ruleDescription} />
    <div className="grid overflow-hidden md:grid-cols-3">{data.rules.map((rule) => {
      const forecast = rule.status === "forecast";
      return <article key={rule.version} className="min-w-0 px-[18px] py-4 shadow-[1px_0_0_var(--border),0_1px_0_var(--border)]">
        <div className="flex items-center justify-between gap-2">
          <BadgeEuro aria-hidden className="size-[18px] text-text-tertiary" />
          <Pill tone={forecast ? "outline" : "active"}>{forecast ? t.forecast : t.verified}</Pill>
        </div>
        <h3 className="mt-3 text-[14.5px] font-semibold">{rule.label}</h3>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">{rule.version}</p>
        <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-text-secondary marker:text-text-tertiary">{rule.assumptions.map((item) => <li key={item}>{item}</li>)}</ul>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">{rule.references.map((reference) => <a key={reference.url} href={reference.url} target="_blank" rel="noreferrer" className="rounded-sm text-xs font-medium text-brand-ink underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">{reference.label}</a>)}</div>
        {forecast && <p className="mt-3 flex items-center gap-2 text-xs font-medium text-late"><CircleAlert className="size-4 shrink-0" />{t.postingBlocked}</p>}
      </article>;
    })}</div>
  </Panel>;
}
