"use client";

import { CalendarClock } from "lucide-react";
import { UserIdentity } from "@/components/user-identity";
import { PersonSelect } from "@/components/person-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PersonnelWorkspaceData } from "../../queries";
import { upsertProjectHourAllocation } from "../../actions";
import { allocatePlannedProjectCosts } from "../../lib/engine";
import type { Text } from "./personnel-copy";
import { Field, MonthSelect, Panel, PanelHeader, Pill, selectClassName } from "./personnel-ui";
import { euro, number, type PanelProps } from "./personnel-utils";

export function ProjectsPanel({ data, t, locale, pending, run }: PanelProps) {
  const ready = data.people.filter((row) => row.annual);
  return <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[0.65fr_1.35fr]">
    <Panel>
      <PanelHeader title={t.allocate} />
      <form className="space-y-3 px-[18px] py-4" onSubmit={(event) => {
        event.preventDefault(); const fd = new FormData(event.currentTarget); const person = ready.find((row) => row.id === fd.get("employeeId"));
        if (!person?.annual) return;
        const costRateCents = person.annual.fullHourlyRateCents;
        run(() => upsertProjectHourAllocation({ employeeId: person.id, projectId: String(fd.get("projectId")), payrollMonth: String(fd.get("month")), plannedMinutes: Math.round(Number(fd.get("hours")) * 60), costRateCents }), t.allocationSaved);
      }}>
        <Field label={t.person}><PersonSelect name="employeeId" label={t.person} options={ready.map(row => ({ value: row.id, userId: row.userId, name: row.name }))} /></Field>
        <Field label={t.projects}><select name="projectId" className={selectClassName}>{data.projects.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
        <Field label={t.month}><MonthSelect name="month" year={data.year} locale={locale} label={t.month} /></Field>
        <Field label={t.hours}><Input name="hours" type="number" step="0.25" defaultValue="40" required /></Field>
        <Button type="submit" disabled={pending || ready.length === 0 || data.projects.length === 0} className="w-full"><CalendarClock className="size-4" />{t.allocate}</Button>
      </form>
    </Panel>
    <AllocationTable data={data} locale={locale} t={t} />
  </div>;
}

export function AllocationTable({ data, locale, t }: { data: PersonnelWorkspaceData; locale: string; t: Text }) {
  const groups = new Map<string, typeof data.allocations>();
  for (const row of data.allocations) { const key = `${row.employeeId}:${row.payrollMonth}`; groups.set(key, [...(groups.get(key) ?? []), row]); }
  return <Panel>
    <PanelHeader title={t.projects} meta={t.capacity} />
    {groups.size ? <div className="divide-y divide-line-soft">{[...groups.values()].map((rows) => {
      const person = data.people.find((candidate) => candidate.id === rows[0].employeeId);
      const monthlyCapacity = person?.annual ? Math.round(person.annual.productiveHoursHundredths / 12 / 100 * 60) : 9_600;
      const allocation = allocatePlannedProjectCosts(rows.map((row) => ({ projectId: row.projectId, plannedMinutes: row.plannedMinutes, costRateCents: row.costRateCents })), monthlyCapacity);
      return <article key={`${rows[0].employeeId}:${rows[0].payrollMonth}`} className="px-[18px] py-3 text-[13.5px]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium"><UserIdentity userId={rows[0].employeeUserId} name={rows[0].employeeName} /> · <span className="tabular-nums">{rows[0].payrollMonth}</span></p>
            <p className={`text-xs ${allocation.overbooked ? "text-late" : "text-muted-foreground"}`}>{t.remaining}: <span className="tabular-nums">{number(allocation.remainingMinutes / 60, locale)} h</span></p>
          </div>
          <Pill tone={allocation.overbooked ? "late" : "neutral"}>{allocation.overbooked ? t.overbooked : t.capacity}</Pill>
        </div>
        <ul className="mt-2 divide-y divide-line-soft rounded-lg border border-line-soft">
          {rows.map((row) => <li key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 px-3 py-2"><span className="truncate">{row.projectName}</span><span className="text-muted-foreground tabular-nums">{number(row.plannedMinutes / 60, locale)} h</span><strong className="font-semibold tabular-nums">{euro(Math.round(row.plannedMinutes * row.costRateCents / 60), locale)}</strong></li>)}
        </ul>
      </article>;
    })}</div> : <p className="px-[18px] py-[11px] text-[13px] text-muted-foreground">{t.noPeople}</p>}
  </Panel>;
}
