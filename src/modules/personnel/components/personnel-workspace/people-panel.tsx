"use client";

import { useState } from "react";
import { Plus, Save } from "lucide-react";
import { UserIdentity } from "@/components/user-identity";
import { PersonSelect } from "@/components/person-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip";
import { SECTION_PAGE_SHORTCUTS } from "@/lib/app-shortcuts";
import type { PayrollEmploymentType } from "@/modules/accounting/lib/payroll-at-2026";
import { localDateInZone } from "@/modules/calendar/date-utils";
import { upsertEmployeePlan } from "../../actions";
import { Field, Panel, PanelHeader, Pill, selectClassName } from "./personnel-ui";
import { employmentLabel, employmentLabels, euro, money, type PanelProps } from "./personnel-utils";

export function PeoplePanel({ initialOpen = false, data, t, locale, pending, run }: PanelProps & { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  const today = localDateInZone(new Date(), "Europe/Vienna");
  return <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[0.8fr_1.2fr]">
    <Panel>
      <PanelHeader
        title={t.createPerson}
        actions={<ShortcutTooltip label={t.createPerson} shortcut={SECTION_PAGE_SHORTCUTS.personnel.newPerson}><Button variant="outline" size="icon" aria-label={t.createPerson} aria-expanded={open} onClick={() => setOpen((value) => !value)}><Plus className="size-4" /></Button></ShortcutTooltip>}
      />
      {open && <form className="grid gap-3 px-[18px] py-4 sm:grid-cols-2" onSubmit={(event) => {
        event.preventDefault();
        const fd = new FormData(event.currentTarget);
        run(() => upsertEmployeePlan({
          name: String(fd.get("name")),
          personnelNumber: String(fd.get("personnelNumber")),
          userId: String(fd.get("userId") || "") || null,
          birthDate: String(fd.get("birthDate") || "") || null,
          collectiveAgreement: String(fd.get("collectiveAgreement")),
          locationId: String(fd.get("locationId")),
          joinedOn: String(fd.get("joinedOn") || "") || null,
          leftOn: null,
          validFrom: String(fd.get("validFrom")),
          employmentType: String(fd.get("employmentType")) as PayrollEmploymentType,
          inputMode: "gross",
          monthlyAmountCents: money(String(fd.get("amount"))),
          weeklyMinutes: Math.round(Number(String(fd.get("weeklyHours")).replace(",", ".")) * 60),
          workdaysPerWeek: 5,
          specialPaymentsEnabled: true,
          holidayPayMonth: 6,
          christmasPayMonth: 11,
          vacationWeeksHundredths: 500,
          expectedSickHoursHundredths: 0,
          trainingHoursHundredths: 0,
          internalHoursHundredths: 0,
          overheadRateBasisPoints: 0,
          salesMarkupBasisPoints: 0,
          taxableBenefitsCents: 0,
          commuterAllowanceCents: 0,
          commuterEuroCents: 0,
          familyBonusCents: 0,
          soleEarnerCreditCents: 0,
          singleParentCreditCents: 0,
        }), t.personnelPlanSaved);
      }}>
        <Field label={t.person}><Input name="name" required autoFocus /></Field>
        <Field label={t.personnelNumber}><Input name="personnelNumber" /></Field>
        <Field label={t.userAccount}><PersonSelect name="userId" label={t.userAccount} emptyLabel="—" options={data.users.map(row => ({ value: row.id, userId: row.id, name: row.name }))} /></Field>
        <Field label={t.birthDate}><Input name="birthDate" type="date" /></Field>
        <Field label={t.collectiveAgreement}><Input name="collectiveAgreement" /></Field>
        <Field label={t.location}><select name="locationId" required className={selectClassName}>{data.locations.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
        <Field label={t.employmentType}><select name="employmentType" className={selectClassName}>{(Object.keys(employmentLabels) as PayrollEmploymentType[]).map((value) => <option key={value} value={value}>{employmentLabel(value, locale)}</option>)}</select></Field>
        <Field label={t.joinedOn}><Input name="joinedOn" type="date" defaultValue={today} /></Field>
        <Field label={t.validFrom}><Input name="validFrom" type="date" defaultValue={today} required /></Field>
        <Field label={t.amount}><Input name="amount" inputMode="decimal" defaultValue="4500" required /></Field>
        <Field label={t.weeklyHours}><Input name="weeklyHours" inputMode="decimal" defaultValue="40" required /></Field>
        <Button type="submit" disabled={pending || data.locations.length === 0} className="mt-1 sm:col-span-2"><Save className="size-4" />{t.savePerson}</Button>
      </form>}
    </Panel>
    <Panel>
      <PanelHeader title={t.people} meta={data.people.length} />
      {data.people.length ? <ul className="divide-y divide-line-soft">
        {data.people.map((person) => <li key={person.id} className="grid items-center gap-x-4 gap-y-1.5 px-[18px] py-[11px] text-[13.5px] transition-colors hover:bg-accent sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <div className="min-w-0">
            <p className="truncate font-medium"><UserIdentity userId={person.userId} name={person.name} /></p>
            <p className="truncate text-xs text-muted-foreground">{person.personnelNumber || "—"} · {person.collectiveAgreement || t.noCollectiveAgreement}</p>
          </div>
          <div className="sm:text-right"><p className="text-xs text-muted-foreground">{t.annual}</p><p className="font-medium tabular-nums">{person.annual ? euro(person.annual.annualEmployerCostCents, locale) : "—"}</p></div>
          <Pill tone={person.annual ? "active" : "neutral"}>{person.annual ? t.complete : t.incomplete}</Pill>
        </li>)}
      </ul> : <p className="px-[18px] py-[11px] text-[13px] text-muted-foreground">{t.noPeople}</p>}
    </Panel>
  </div>;
}
