"use client";

import { CircleAlert, FileStack, UserPlus } from "lucide-react";
import { UserIdentity } from "@/components/user-identity";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { PayrollEmploymentType } from "@/modules/accounting/lib/payroll-at-2026";
import { closePersonnelMonth } from "../../actions";
import { getPayrollRuleSet } from "../../lib/rules";
import { Field, GroupLabel, KpiStrip, MonthSelect, Panel, PanelHeader, Pill } from "./personnel-ui";
import { employmentLabel, euro, number, type PanelProps } from "./personnel-utils";

export function OverviewPanel({ data, t, locale, pending, run, onCreatePerson }: PanelProps & { onCreatePerson: () => void }) {
  const totals = data.people.reduce((acc, person) => ({
    cost: acc.cost + (person.annual?.annualEmployerCostCents ?? 0),
    hours: acc.hours + (person.annual?.productiveHoursHundredths ?? 0),
  }), { cost: 0, hours: 0 });
  const verified = getPayrollRuleSet(data.year).status === "verified";

  return <div className="space-y-5">
    <Panel>
      <KpiStrip
        className="grid-cols-2 md:grid-cols-4"
        items={[
          { label: t.annualCost, value: euro(totals.cost, locale) },
          { label: t.monthlyCost, value: euro(Math.round(totals.cost / 12), locale) },
          { label: t.productive, value: `${number(totals.hours / 100, locale)} h` },
          { label: t.hourly, value: totals.hours ? euro(Math.round(totals.cost * 100 / totals.hours), locale) : "—" },
        ]}
      />
    </Panel>
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Panel>
        <PanelHeader title={t.costFlow} meta={data.people.length ? `${data.people.length} ${t.people}` : undefined} />
        {data.people.length ? <ul className="divide-y divide-line-soft">
          {data.people.map((person) => <li key={person.id} className="grid items-center gap-x-4 gap-y-2 px-[18px] py-[11px] text-[13.5px] transition-colors hover:bg-accent md:grid-cols-[minmax(0,1fr)_auto_8.5rem_8.5rem]">
            <div className="min-w-0">
              <p className="truncate font-medium"><UserIdentity userId={person.userId} name={person.name} /></p>
              <p className="truncate text-xs text-muted-foreground">{person.locationName} · {employmentLabel(person.employmentType as PayrollEmploymentType, locale)}</p>
            </div>
            <Pill tone={person.annual ? "active" : "neutral"}>{person.annual ? t.complete : t.incomplete}</Pill>
            <div className="md:text-right"><p className="text-xs text-muted-foreground">{t.annual}</p><p className="font-semibold tabular-nums">{person.annual ? euro(person.annual.annualEmployerCostCents, locale) : "—"}</p></div>
            <div className="md:text-right"><p className="text-xs text-muted-foreground">{t.hourly}</p><p className="font-semibold tabular-nums">{person.annual ? euro(person.annual.directHourlyRateCents, locale) : "—"}</p></div>
          </li>)}
        </ul> : <EmptyState
          icon={<UserPlus />}
          title={t.noPeople}
          actions={<Button variant="outline" size="sm" onClick={onCreatePerson}><UserPlus className="size-3.5" />{t.createPerson}</Button>}
        />}
      </Panel>
      <Panel className="border-[color:color-mix(in_oklab,var(--brand)_30%,var(--border))]">
        <div className="flex flex-col gap-3 px-[18px] py-4">
          <GroupLabel>{t.closing}</GroupLabel>
          <p className="text-xl leading-tight font-semibold tabular-nums">{data.year}</p>
          <p className="text-[13px] text-muted-foreground">{t.planningAid}</p>
          <Field label={t.month}><MonthSelect id="close-month" year={data.year} locale={locale} label={t.month} /></Field>
          <Button disabled={pending || !verified} className="w-full" onClick={() => {
            const value = (document.getElementById("close-month") as HTMLSelectElement).value;
            run(() => closePersonnelMonth(value), t.monthClosed);
          }}><FileStack className="size-4" />{t.closeMonth}</Button>
          {!verified && <p className="flex items-center gap-2 text-[13px] text-late"><CircleAlert className="size-4 shrink-0" />{t.postingBlocked}</p>}
        </div>
      </Panel>
    </div>
  </div>;
}
