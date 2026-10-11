"use client";

import type { Dispatch, SetStateAction } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { PersonSelect } from "@/components/person-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PayrollEmploymentType } from "@/modules/accounting/lib/payroll-at-2026";
import type { PersonnelWorkspaceData } from "../../queries";
import type { calculateAnnualPersonnelCost, calculatePayroll } from "../../lib/engine";
import { SwitchLike } from "../switch-like";
import type { Text } from "./personnel-copy";
import { Field, GroupLabel, KpiStrip, Panel, PanelHeader, Pill, selectClassName } from "./personnel-ui";
import { employmentLabel, employmentLabels, euro, number, type CalculatorState } from "./personnel-utils";

export function CalculatorPanel({ t, locale, calc, setCalc, annual, monthly, scenarioName, setScenarioName, scenarioEmployeeId, setScenarioEmployeeId, people, locations, pending, save }: {
  t: Text; locale: string; calc: CalculatorState; setCalc: Dispatch<SetStateAction<CalculatorState>>;
  annual: ReturnType<typeof calculateAnnualPersonnelCost> | null; monthly: ReturnType<typeof calculatePayroll> | null;
  scenarioName: string; setScenarioName: (value: string) => void; scenarioEmployeeId: string; setScenarioEmployeeId: (value: string) => void;
  people: PersonnelWorkspaceData["people"]; locations: PersonnelWorkspaceData["locations"]; pending: boolean; save: () => void;
}) {
  const update = <K extends keyof typeof calc>(key: K, value: (typeof calc)[K]) => setCalc((current) => ({ ...current, [key]: value }));
  return <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[0.78fr_1.22fr]">
    <Panel>
      <PanelHeader title={t.calculate} meta={t.calculator} />
      <div className="grid gap-3 px-[18px] py-4 sm:grid-cols-2">
        <Field label={t.year}><select value={calc.year} onChange={(e) => update("year", Number(e.target.value))} className={selectClassName}><option>2025</option><option>2026</option><option>2027</option></select></Field>
        <Field label={t.inputAs}><select value={calc.inputMode} onChange={(e) => update("inputMode", e.target.value as "gross" | "net")} className={selectClassName}><option value="gross">{t.gross}</option><option value="net">{t.net}</option></select></Field>
        <Field label={t.amount}><Input value={calc.amount} onChange={(e) => update("amount", e.target.value)} inputMode="decimal" /></Field>
        <Field label={t.employmentType}><select value={calc.employmentType} onChange={(e) => update("employmentType", e.target.value as PayrollEmploymentType)} className={selectClassName}>{(Object.keys(employmentLabels) as PayrollEmploymentType[]).map((value) => <option key={value} value={value}>{employmentLabel(value, locale)}</option>)}</select></Field>
        <Field label={t.location}><select value={calc.locationId} onChange={(e) => update("locationId", e.target.value)} className={selectClassName}>{locations.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.state}</option>)}</select></Field>
        {(["weeklyHours", "vacationWeeks", "sickHours", "trainingHours", "internalHours", "overhead", "markup"] as const).map((key) => <Field key={key} label={t[key]}><Input value={calc[key]} onChange={(e) => update(key, e.target.value)} inputMode="decimal" /></Field>)}
        {(["taxableBenefits", "commuterAllowance", "commuterEuro", "familyBonus"] as const).map((key) => <Field key={key} label={t[key]}><Input value={calc[key]} onChange={(e) => update(key, e.target.value)} inputMode="decimal" /></Field>)}
        <div className="sm:col-span-2"><SwitchLike checked={calc.specialPayments} onChange={(value) => update("specialPayments", value)} label={t.specialPayments} /></div>
      </div>
    </Panel>
    <Panel>
      <PanelHeader title={t.costFlow} actions={annual ? <Pill tone="outline">{annual.ruleVersion}</Pill> : undefined} />
      <div className="px-[18px] pt-4">
        <GroupLabel>{t.annual}</GroupLabel>
        <p className="mt-1 text-2xl leading-tight font-semibold tracking-[-0.02em] tabular-nums">{annual ? euro(annual.annualEmployerCostCents, locale) : "—"}</p>
      </div>
      {monthly && annual && <div>
        <div className="grid grid-cols-2 items-center gap-3 px-[18px] py-4 sm:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] sm:gap-2">
          <Flow label={t.gross} value={euro(monthly.grossCents, locale)} /><FlowArrow />
          <Flow label={t.net} value={euro(monthly.netCents, locale)} /><FlowArrow />
          <Flow label={t.levies} value={euro(monthly.employerTotalCents - monthly.grossCents, locale)} /><FlowArrow />
          <Flow label={t.employer} value={euro(monthly.employerTotalCents, locale)} strong />
        </div>
        <dl className="grid border-t border-line-soft sm:grid-cols-2">
          <Breakdown label={t.svEmployee} value={monthly.components.employeeSv.amountCents} locale={locale} />
          <Breakdown label={t.wageTax} value={monthly.components.wageTax.amountCents} locale={locale} />
          <Breakdown label={t.svEmployer} value={monthly.employerSocialCents} locale={locale} />
          <Breakdown label={t.statutoryLevies} value={monthly.components.db.amountCents + monthly.components.dz.amountCents + monthly.components.municipalTax.amountCents + monthly.components.bvContribution.amountCents} locale={locale} />
        </dl>
        <KpiStrip
          className="grid-cols-2 bg-surface-raised sm:grid-cols-4"
          valueClassName="text-lg"
          items={[
            { label: t.annual, value: euro(annual.annualEmployerCostCents, locale) },
            { label: t.productive, value: `${number(annual.productiveHoursHundredths / 100, locale)} h` },
            { label: t.fullRate, value: euro(annual.fullHourlyRateCents, locale) },
            { label: t.salesRate, value: euro(annual.salesHourlyRateCents, locale) },
          ]}
        />
        <div className="grid gap-2 border-t px-[18px] py-4 sm:grid-cols-[1fr_1fr_auto]"><Input value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} aria-label={t.scenarioName} /><PersonSelect label={t.person} value={scenarioEmployeeId} onValueChange={setScenarioEmployeeId} emptyLabel={t.prospectivePerson} options={people.map(person => ({ value: person.id, userId: person.userId, name: person.name }))} /><Button variant="outline" disabled={pending || !scenarioName.trim()} onClick={save}><Sparkles className="size-4" />{t.saveScenario}</Button></div>
      </div>}
    </Panel>
  </div>;
}

function FlowArrow() {
  return <ArrowRight aria-hidden className="hidden size-4 text-text-tertiary sm:block" />;
}

function Flow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className={cn("min-w-0 rounded-lg px-3 py-2.5", strong ? "bg-brand-soft text-brand-ink" : "bg-muted")}>
    <p className={cn("text-[11px] font-semibold tracking-[0.1em] uppercase", strong ? "text-brand-ink" : "text-text-tertiary")}>{label}</p>
    <p className="mt-1 truncate text-[15px] font-semibold tabular-nums">{value}</p>
  </div>;
}

function Breakdown({ label, value, locale }: { label: string; value: number; locale: string }) {
  return <div className="flex items-center justify-between gap-3 border-b border-line-soft px-[18px] py-[11px] text-[13.5px] sm:odd:border-r">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="font-semibold tabular-nums">{euro(value, locale)}</dd>
  </div>;
}
