"use client";

import { BriefcaseBusiness, Landmark } from "lucide-react";
import { UserIdentity } from "@/components/user-identity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { linkPersonnelFundingProject, upsertFundingCostProfile } from "../../actions";
import { applyFundingProfile } from "../../lib/engine";
import { Field, Panel, PanelHeader, Pill, selectClassName } from "./personnel-ui";
import { euro, money, type PanelProps } from "./personnel-utils";

export function FundingPanel({ data, t, locale, pending, run }: PanelProps) {
  const estimates = data.fundingLinks.flatMap((link) => {
    const profile = data.fundingProfiles.find((row) => row.id === link.fundingProfileId);
    const rows = data.allocations.filter((row) => row.projectId === link.projectId);
    if (!profile) return [];
    return rows.flatMap((row) => {
      const person = data.people.find((candidate) => candidate.id === row.employeeId);
      if (!person?.annual) return [];
      const result = applyFundingProfile({
        annualEmployerCostCents: person.annual.annualEmployerCostCents,
        productiveHoursHundredths: person.annual.productiveHoursHundredths,
        plannedHoursHundredths: Math.round(row.plannedMinutes / 60 * 100),
        profile: { ...profile, eligibleComponents: profile.eligibleComponentsJson },
      });
      return [{ key: `${link.id}:${row.id}`, person: person.name, userId: person.userId, project: row.projectName, profile: profile.name, result }];
    });
  });
  return <div className="space-y-5">
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
      <Panel>
        <PanelHeader title={t.fundingProfiles} meta={data.fundingProfiles.length} />
        <form className="grid gap-3 px-[18px] py-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); const fd = new FormData(event.currentTarget); run(() => upsertFundingCostProfile({ name: String(fd.get("name")), version: String(fd.get("version")), validFrom: String(fd.get("validFrom")), validTo: null, divisorMode: String(fd.get("divisorMode")) as "productive_hours" | "fixed", fixedAnnualDivisor: Number(fd.get("fixedDivisor")) || null, eligibleComponents: ["gross", "employerSocial", "statutoryLevies"], hourlyCapCents: money(String(fd.get("hourlyCap"))) || null, maxAnnualHoursHundredths: Math.round(Number(fd.get("maxHours")) * 100) || null, overheadRateBasisPoints: Math.round(Number(fd.get("overhead")) * 100), roundingMode: "cent" }), t.fundingProfileSaved); }}>
          <Field label={t.profileName}><Input name="name" required /></Field>
          <Field label={t.version}><Input name="version" defaultValue="1.0" required /></Field>
          <Field label={t.validFrom}><Input name="validFrom" type="date" defaultValue={`${data.year}-01-01`} required /></Field>
          <Field label={t.divisor}><select name="divisorMode" className={selectClassName}><option value="productive_hours">{t.productive}</option><option value="fixed">{t.fixed}</option></select></Field>
          <Field label={t.fixedDivisor}><Input name="fixedDivisor" type="number" defaultValue="1720" /></Field>
          <Field label={t.hourlyCap}><Input name="hourlyCap" inputMode="decimal" /></Field>
          <Field label={t.maxHours}><Input name="maxHours" type="number" /></Field>
          <Field label={t.overhead}><Input name="overhead" defaultValue="0" /></Field>
          <Button type="submit" disabled={pending} className="mt-1 sm:col-span-2"><Landmark className="size-4" />{t.createProfile}</Button>
        </form>
        {data.fundingProfiles.length > 0 && <ul className="divide-y divide-line-soft border-t border-line-soft">
          {data.fundingProfiles.map((profile) => <li key={profile.id} className="flex items-center gap-3 px-[18px] py-[11px] text-[13.5px] transition-colors hover:bg-accent">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{profile.name}</p>
              <p className="truncate text-xs text-muted-foreground">{profile.divisorMode === "fixed" ? `${profile.fixedAnnualDivisor} h` : t.productive} · {t.overhead} {profile.overheadRateBasisPoints / 100} %</p>
            </div>
            <Pill tone="outline">{profile.version}</Pill>
          </li>)}
        </ul>}
      </Panel>
      <Panel>
        <PanelHeader title={t.linkProject} />
        <form className="space-y-3 px-[18px] py-4" onSubmit={(event) => { event.preventDefault(); const fd = new FormData(event.currentTarget); run(() => linkPersonnelFundingProject({ projectId: String(fd.get("projectId")), fundingProjectId: String(fd.get("fundingProjectId")), fundingProfileId: String(fd.get("profileId")) || null }), t.fundingProjectLinked); }}>
          <Field label={t.projects}><select name="projectId" className={selectClassName}>{data.projects.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
          <Field label={t.fundingProject}><select name="fundingProjectId" className={selectClassName}>{data.fundingProjects.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
          <Field label={t.fundingProfiles}><select name="profileId" className={selectClassName}><option value="">—</option>{data.fundingProfiles.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.version}</option>)}</select></Field>
          <Button type="submit" disabled={pending || data.projects.length === 0 || data.fundingProjects.length === 0} className="w-full"><BriefcaseBusiness className="size-4" />{t.linkProject}</Button>
        </form>
      </Panel>
    </div>
    {estimates.length > 0 && <Panel>
      <PanelHeader title={t.eligiblePlannedCosts} meta={estimates.length} />
      <ul className="divide-y divide-line-soft">
        {estimates.map((row) => <li key={row.key} className="grid items-center gap-x-4 gap-y-1 px-[18px] py-[11px] text-[13.5px] transition-colors hover:bg-accent sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div className="min-w-0"><p className="truncate font-medium"><UserIdentity userId={row.userId} name={row.person} /></p><p className="truncate text-xs text-muted-foreground">{row.project} · {row.profile}</p></div>
          <span className="text-muted-foreground tabular-nums">{row.result.eligibleHoursHundredths / 100} h × {euro(row.result.eligibleHourlyRateCents, locale)}</span>
          <strong className="font-semibold tabular-nums sm:text-right">{euro(row.result.totalEligibleCents, locale)}</strong>
        </li>)}
      </ul>
    </Panel>}
  </div>;
}
