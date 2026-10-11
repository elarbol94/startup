"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useKeyboardShortcut } from "@/components/use-keyboard-shortcut";
import { SECTION_PAGE_SHORTCUTS } from "@/lib/app-shortcuts";
import { SubNav, SubNavButton } from "@/components/ui/sub-nav";
import type { PayrollEmploymentType } from "@/modules/accounting/lib/payroll-at-2026";
import { savePersonnelScenario } from "../actions";
import type { PersonnelWorkspaceData } from "../queries";
import {
  calculateAnnualPersonnelCost,
  calculatePayroll,
  solveGrossForNet,
  type EmploymentContractPeriod,
} from "../lib/engine";
import { personnelCopy } from "./personnel-workspace/personnel-copy";
import { PersonnelHeader } from "./personnel-workspace/personnel-header";
import { Panel } from "./personnel-workspace/personnel-ui";
import { employeePlanFromCalculator, money, tabs, type CalculatorState, type Tab } from "./personnel-workspace/personnel-utils";
import { OverviewPanel } from "./personnel-workspace/overview-panel";
import { PeoplePanel } from "./personnel-workspace/people-panel";
import { CalculatorPanel } from "./personnel-workspace/calculator-panel";
import { AllocationTable, ProjectsPanel } from "./personnel-workspace/projects-panel";
import { FundingPanel } from "./personnel-workspace/funding-panel";
import { RulesPanel, ScenariosPanel } from "./personnel-workspace/scenarios-rules-panels";

export function PersonnelWorkspace({ data, locale }: { data: PersonnelWorkspaceData; locale: string }) {
  const t = personnelCopy(locale);
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [createPersonRequest, setCreatePersonRequest] = useState(0);
  const openPersonForm = () => { setTab("people"); setCreatePersonRequest((value) => value + 1); };
  // N ("Neu") opens the person form from every tab of the section.
  useKeyboardShortcut(SECTION_PAGE_SHORTCUTS.personnel.newPerson, openPersonForm);
  const [pending, startTransition] = useTransition();
  const firstLocation = data.locations[0];
  const [calc, setCalc] = useState<CalculatorState>({
    year: data.year,
    inputMode: "gross" as "gross" | "net",
    amount: "4500",
    employmentType: "employee" as PayrollEmploymentType,
    locationId: firstLocation?.id ?? "",
    weeklyHours: "40",
    vacationWeeks: "5",
    sickHours: "0",
    trainingHours: "0",
    internalHours: "0",
    overhead: "15",
    markup: "20",
    specialPayments: true,
    taxableBenefits: "0",
    commuterAllowance: "0",
    commuterEuro: "0",
    familyBonus: "0",
  });
  const [scenarioName, setScenarioName] = useState(t.defaultScenarioName);
  const [scenarioEmployeeId, setScenarioEmployeeId] = useState("");
  const location = data.locations.find((row) => row.id === calc.locationId) ?? firstLocation;
  const contract = useMemo<EmploymentContractPeriod>(() => ({
    validFrom: `${calc.year}-01-01`,
    employmentType: calc.employmentType,
    inputMode: calc.inputMode,
    monthlyAmountCents: money(calc.amount),
    weeklyMinutes: Math.round(Number(calc.weeklyHours.replace(",", ".")) * 60),
    workdaysPerWeek: 5,
    specialPaymentsEnabled: calc.specialPayments,
    holidayPayMonth: 6,
    christmasPayMonth: 11,
    vacationWeeksHundredths: Math.round(Number(calc.vacationWeeks.replace(",", ".")) * 100),
    expectedSickHoursHundredths: Math.round(Number(calc.sickHours.replace(",", ".")) * 100),
    trainingHoursHundredths: Math.round(Number(calc.trainingHours.replace(",", ".")) * 100),
    internalHoursHundredths: Math.round(Number(calc.internalHours.replace(",", ".")) * 100),
    overheadRateBasisPoints: Math.round(Number(calc.overhead.replace(",", ".")) * 100),
    salesMarkupBasisPoints: Math.round(Number(calc.markup.replace(",", ".")) * 100),
  }), [calc]);
  const tax = useMemo(() => ({
    taxableBenefitsCents: money(calc.taxableBenefits),
    commuterAllowanceCents: money(calc.commuterAllowance),
    commuterEuroCents: money(calc.commuterEuro),
    familyBonusCents: money(calc.familyBonus),
  }), [calc.commuterAllowance, calc.commuterEuro, calc.familyBonus, calc.taxableBenefits]);
  const annual = useMemo(() => location ? calculateAnnualPersonnelCost({
    year: calc.year,
    contract,
    location: { state: location.state, municipality: location.municipality },
    tax,
  }) : null, [calc.year, contract, location, tax]);
  const regularGross = calc.inputMode === "gross" ? money(calc.amount) : location ? solveGrossForNet({
    year: calc.year,
    payrollMonth: `${calc.year}-01`,
    targetNetCents: money(calc.amount),
    employmentType: calc.employmentType,
    location: { state: location.state, municipality: location.municipality },
    ...tax,
  }).grossCents : 0;
  const monthly = location ? calculatePayroll({
    year: calc.year,
    payrollMonth: `${calc.year}-01`,
    grossCents: regularGross,
    employmentType: calc.employmentType,
    location: { state: location.state, municipality: location.municipality },
    ...tax,
  }) : null;

  function run(action: () => Promise<unknown>, success: string) {
    startTransition(async () => {
      try {
        await action();
        toast.success(success);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t.genericError);
      }
    });
  }

  if (!data.fullAccess) {
    return <div className="mx-auto max-w-[1200px] space-y-5">
      <PersonnelHeader t={t} />
      <Panel className="flex items-start gap-3 px-[18px] py-4">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-ink"><ShieldCheck className="size-[18px]" /></span>
        <div className="min-w-0">
          <h2 className="text-[14.5px] font-semibold">{t.restrictedTitle}</h2>
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">{t.restrictedBody}</p>
        </div>
      </Panel>
      <AllocationTable data={data} locale={locale} t={t} />
    </div>;
  }

  const panel = { data, t, locale, pending, run };
  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <PersonnelHeader t={t} />
      <SubNav label={t.title}>
        {tabs.map((key) => <SubNavButton key={key} active={tab === key} onClick={() => setTab(key)}>{t[key]}</SubNavButton>)}
      </SubNav>

      {tab === "overview" && <OverviewPanel {...panel} onCreatePerson={openPersonForm} />}
      {tab === "people" && <PeoplePanel key={createPersonRequest} initialOpen={createPersonRequest > 0} {...panel} />}
      {tab === "calculator" && <CalculatorPanel t={t} locale={locale} calc={calc} setCalc={setCalc} annual={annual} monthly={monthly} scenarioName={scenarioName} setScenarioName={setScenarioName} scenarioEmployeeId={scenarioEmployeeId} setScenarioEmployeeId={setScenarioEmployeeId} people={data.people} locations={data.locations} pending={pending} save={() => annual && run(() => savePersonnelScenario({ name: scenarioName, employeeId: scenarioEmployeeId || null, planningYear: calc.year, input: { ...calc, ...employeePlanFromCalculator(calc, location?.id ?? "") }, result: annual as unknown as Record<string, unknown>, ruleVersion: annual.ruleVersion }), t.scenarioSaved)} />}
      {tab === "projects" && <ProjectsPanel {...panel} />}
      {tab === "funding" && <FundingPanel {...panel} />}
      {tab === "scenarios" && <ScenariosPanel {...panel} currentAnnual={annual} />}
      {tab === "rules" && <RulesPanel data={data} t={t} />}
    </div>
  );
}
