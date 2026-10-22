"use client";

import { useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Paperclip,
  Plus,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { deleteEntry, upsertEntry, type EntryInput } from "@/modules/accounting/actions";
import { ProjectPicker, useProjectLinkDraft } from "@/modules/context/components/project-links-field";
import type { EntryRow } from "@/modules/accounting/queries";
import { formatCents, parseAmountToCents } from "@/lib/money";
import { ENTRY_FORM_CONFIG, type EntryBaseField } from "../lib/entry-form-config";
import { breakdownFromGross, breakdownFromNet, VAT_RATES } from "../lib/vat";
import { payrollResultToSpecialFields, storedAmountCents, type SpecialFields } from "../lib/payroll-special-fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EvidencePanel } from "@/modules/wiki/components/evidence-panel";
import { EntryCategoryStep } from "./entry-dialog/entry-category-step";
import type {
  AmountMode,
  Category,
  PayrollMonthContext,
  PersonnelEmployee,
  PersonnelLocation,
  TaxLineState,
} from "./entry-dialog/entry-dialog-types";
import { EVIDENCE_TEMPLATES, moneyText, newLine, nextMonth, NON_VAT_TEMPLATES, todayIso } from "./entry-dialog/entry-dialog-utils";
import { FieldLabel, FormSection } from "./entry-dialog/entry-form-parts";
import { EntrySpecialFields } from "./entry-dialog/entry-special-fields";
import { useEntryAttachments } from "./entry-dialog/use-entry-attachments";
import { usePayrollCalculation } from "./entry-dialog/use-payroll-calculation";

export function EntryDialog({
  open,
  onOpenChange,
  entry,
  categories,
  canManagePersonnel,
  taxSettings,
  fundingProjects,
  personnelEmployees,
  personnelLocations,
  payrollMonthContexts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: EntryRow | null;
  categories: Category[];
  canManagePersonnel: boolean;
  taxSettings: { kleinunternehmer: boolean; defaultVatRate: number };
  fundingProjects: Array<{ id: string; name: string }>;
  personnelEmployees: PersonnelEmployee[];
  personnelLocations: PersonnelLocation[];
  payrollMonthContexts: PayrollMonthContext[];
}) {
  const t = useTranslations("accounting");
  const tf = useTranslations("accountingEntry");
  const tc = useTranslations("common");
  const tp = useTranslations("projectLinks");
  const locale = useLocale();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"category" | "form">("category");
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<"income" | "expense">("expense");
  const [categoryId, setCategoryId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [documentDate, setDocumentDate] = useState(todayIso());
  const [documentNumber, setDocumentNumber] = useState("");
  const [servicePeriodStart, setServicePeriodStart] = useState("");
  const [servicePeriodEnd, setServicePeriodEnd] = useState("");
  const [description, setDescription] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"bank" | "cash" | "card">("bank");
  const [notes, setNotes] = useState("");
  const [deductiblePercent, setDeductiblePercent] = useState(100);
  const [warningOverrideReason, setWarningOverrideReason] = useState("");
  const [taxLines, setTaxLines] = useState<TaxLineState[]>([newLine()]);
  const [special, setSpecial] = useState<Record<string, string | boolean>>({});
  const [pending, setPending] = useState(false);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [persistedEntryId, setPersistedEntryId] = useState<string | null>(null);
  const [syncKey, setSyncKey] = useState<string | null>(null);
  const projectLinks = useProjectLinkDraft("accountingEntry", entry?.id ?? null, [], open ? (entry?.id ?? "new") : null);
  const {
    existingAttachments,
    setExistingAttachments,
    pendingFiles,
    setPendingFiles,
    uploadFiles,
    removeExistingAttachment,
  } = useEntryAttachments(open, entry);

  const currentKey = open ? (entry?.id ?? "new") : null;
  if (syncKey !== currentKey) {
    setSyncKey(currentKey);
    if (currentKey !== null) {
      const entrySpecial = entry?.specialFields ?? {};
      setStep(entry ? "form" : "category");
      setIsDuplicate(false);
      setPersistedEntryId(entry?.id ?? null);
      setSearch("");
      setKind(entry?.kind ?? "expense");
      setCategoryId(entry?.categoryId ?? "");
      setDate(entry?.date ?? todayIso());
      setDocumentDate(entry?.documentDate ?? entry?.date ?? todayIso());
      setDocumentNumber(entry?.documentNumber ?? "");
      setServicePeriodStart(entry?.servicePeriodStart ?? "");
      setServicePeriodEnd(entry?.servicePeriodEnd ?? "");
      setDescription(entry?.description ?? "");
      setCounterparty(entry?.counterparty ?? "");
      setPaymentMethod(entry?.paymentMethod ?? "bank");
      setNotes(entry?.notes ?? "");
      setDeductiblePercent(entry?.deductiblePercent ?? 100);
      setWarningOverrideReason(entry?.warningOverrideReason ?? "");
      const restoredSpecial = Object.fromEntries(
          Object.entries(entrySpecial).map(([key, value]) => [key, typeof value === "boolean" ? value : String(value ?? "")]),
        );
      const entryTemplate = categories.find((item) => item.id === entry?.categoryId)?.template;
      if (entryTemplate === "personnel" && !restoredSpecial.calculationMode) restoredSpecial.calculationMode = "manual";
      if (restoredSpecial.employmentType === "managing_director") restoredSpecial.employmentType = "managing_director_asvg";
      setSpecial(restoredSpecial);
      setTaxLines(
        entry?.taxLines.length
          ? entry.taxLines.map((line) => ({
              key: line.id,
              description: line.description,
              amountText: moneyText(line.grossAmountCents),
              mode: "gross" as const,
              vatRate: line.vatRate,
              inputVatDeductiblePercent: line.inputVatDeductiblePercent,
            }))
          : [newLine(entry?.vatRate ?? 20)],
      );
      setExistingAttachments([]);
      setPendingFiles([]);
    }
  }

  const category = categories.find((item) => item.id === categoryId);
  const template = category?.template ?? (kind === "income" ? "standard_income" : "standard_expense");
  const formConfig = ENTRY_FORM_CONFIG[template];
  const hasBaseField = (field: EntryBaseField) =>
    (formConfig.baseFields as readonly EntryBaseField[]).includes(field);

  function chooseCategory(next: Category) {
    setCategoryId(next.id);
    setKind(next.kind);
    const rateFromName = VAT_RATES.find((rate) => next.name.includes(`${rate} %`));
    const rate = NON_VAT_TEMPLATES.has(next.template) || (taxSettings.kleinunternehmer && next.kind === "income")
      ? 0
      : (rateFromName ?? taxSettings.defaultVatRate);
    const inputPercent = next.template === "vehicle" || taxSettings.kleinunternehmer ? 0 : 100;
    setTaxLines([newLine(rate, inputPercent)]);
    const defaultLocation = personnelLocations.find((location) => location.name === "Graz / Steiermark") ?? personnelLocations[0];
    setSpecial(next.template === "svs"
      ? { authority: "SVS" }
      : next.template === "personnel"
        ? { calculationMode: "auto", employmentType: "employee", payrollMonth: date.slice(0, 7), locationId: defaultLocation?.id ?? "" }
        : {});
    setDeductiblePercent(next.template === "hospitality" ? 50 : 100);
    setStep("form");
  }

  function duplicatePersonnelMonth() {
    setIsDuplicate(true);
    setPersistedEntryId(null);
    setDate((current) => nextMonth(current));
    setDocumentDate((current) => nextMonth(current));
    setDocumentNumber("");
    setWarningOverrideReason("");
    setExistingAttachments([]);
    setPendingFiles([]);
    setSpecial((current) => {
      const shifted = { ...current };
      for (const key of [
        "payrollMonth",
        "employeePaymentDate",
        "socialPaymentDate",
        "taxPaymentDate",
        "municipalPaymentDate",
        "provisionPaymentDate",
      ]) {
        if (typeof shifted[key] === "string" && shifted[key]) shifted[key] = nextMonth(shifted[key]);
      }
      return shifted;
    });
  }

  const payrollCalculation = usePayrollCalculation({ template, special, entry, payrollMonthContexts, personnelLocations });

  const effectivePersonnelSpecial = useMemo(() => {
    if (!payrollCalculation) return special as SpecialFields;
    return payrollResultToSpecialFields(special as SpecialFields, payrollCalculation);
  }, [payrollCalculation, special]);

  const personnelCostCents = useMemo(() => {
    if (template !== "personnel") return null;
    return ["grossSalary", "employerSv", "db", "dz", "municipalTax", "bvContribution", "viennaLevy", "otherPersonnelCost"]
      .map((key) => storedAmountCents(effectivePersonnelSpecial[key]))
      .reduce((sum, value) => sum + value, 0);
  }, [effectivePersonnelSpecial, template]);

  const computedLines = useMemo(() => {
    if (template === "personnel") {
      if (!personnelCostCents) return [];
      return [{
        description: tf("personnel.total"),
        netAmountCents: personnelCostCents,
        vatRate: 0,
        vatAmountCents: 0,
        grossAmountCents: personnelCostCents,
        inputVatDeductiblePercent: 0,
      }];
    }
    if (formConfig.amountMode === "gross") {
      const cents = parseAmountToCents(taxLines[0]?.amountText ?? "");
      if (cents === null || cents <= 0) return [];
      return [{
        description,
        netAmountCents: cents,
        vatRate: 0,
        vatAmountCents: 0,
        grossAmountCents: cents,
        inputVatDeductiblePercent: 0,
      }];
    }
    return taxLines.flatMap((line) => {
      const cents = parseAmountToCents(line.amountText);
      if (cents === null || cents <= 0) return [];
      const breakdown = line.mode === "gross"
        ? breakdownFromGross(cents, line.vatRate as (typeof VAT_RATES)[number])
        : breakdownFromNet(cents, line.vatRate as (typeof VAT_RATES)[number]);
      return [{
        description: line.description,
        netAmountCents: breakdown.netCents,
        vatRate: line.vatRate,
        vatAmountCents: breakdown.vatCents,
        grossAmountCents: breakdown.grossCents,
        inputVatDeductiblePercent: taxSettings.kleinunternehmer
          ? 0
          : template === "vehicle"
            ? (special.inputVatEligible === true ? 100 : 0)
            : line.inputVatDeductiblePercent,
      }];
    });
  }, [description, formConfig.amountMode, personnelCostCents, special.inputVatEligible, taxLines, taxSettings.kleinunternehmer, template, tf]);

  const computedPaymentLines = useMemo(() => {
    if (template !== "personnel") {
      return [];
    }
    const amount = (key: string) => storedAmountCents(effectivePersonnelSpecial[key]);
    const lines = [
      { date: String(effectivePersonnelSpecial.employeePaymentDate || date), description: tf("personnel.payments.net"), recipient: String(effectivePersonnelSpecial.employeeName ?? ""), amountCents: amount("netSalary"), paymentMethod },
      { date: String(effectivePersonnelSpecial.socialPaymentDate || date), description: tf("personnel.payments.social"), recipient: "ÖGK", amountCents: amount("employeeSv") + amount("employerSv"), paymentMethod },
      { date: String(effectivePersonnelSpecial.taxPaymentDate || date), description: tf("personnel.payments.taxOffice"), recipient: "Finanzamt", amountCents: amount("wageTax") + amount("db") + amount("dz"), paymentMethod },
      { date: String(effectivePersonnelSpecial.municipalPaymentDate || date), description: tf("personnel.payments.municipality"), recipient: String(effectivePersonnelSpecial.municipality ?? "Gemeinde"), amountCents: amount("municipalTax") + amount("viennaLevy"), paymentMethod },
      { date: String(effectivePersonnelSpecial.provisionPaymentDate || date), description: tf("personnel.payments.provision"), recipient: String(effectivePersonnelSpecial.provisionFund ?? "Vorsorgekasse"), amountCents: amount("bvContribution"), paymentMethod },
      { date, description: tf("personnel.payments.other"), recipient: counterparty, amountCents: amount("otherPersonnelCost"), paymentMethod },
    ];
    return lines.filter((line) => line.amountCents > 0);
  }, [counterparty, date, effectivePersonnelSpecial, paymentMethod, template, tf]);

  const totals = computedLines.reduce(
    (sum, line) => ({ net: sum.net + line.netAmountCents, vat: sum.vat + line.vatAmountCents, gross: sum.gross + line.grossAmountCents }),
    { net: 0, vat: 0, gross: 0 },
  );
  const paymentRecipient = template === "svs" || template === "tax_levy"
    ? String(special.authority ?? (template === "svs" ? "SVS" : ""))
    : counterparty;
  const paymentLines = template === "personnel"
    ? computedPaymentLines
    : totals.gross > 0
      ? [{ date, description, recipient: paymentRecipient, amountCents: totals.gross, paymentMethod }]
      : [];
  const paymentTotal = paymentLines.reduce((sum, line) => sum + line.amountCents, 0);
  const hasEvidence = existingAttachments.length > 0 || pendingFiles.length > 0;
  const warnings = [
    ...(EVIDENCE_TEMPLATES.has(template) && !hasEvidence ? [tf("warnings.missingEvidence")] : []),
    ...(template === "hospitality" && (!special.participants || !special.businessPurpose) ? [tf("warnings.hospitalityDetails")] : []),
    ...(template === "travel" && (!special.destination || !special.travelPurpose) ? [tf("warnings.travelDetails")] : []),
    ...(template === "vehicle" && !special.vehicleType ? [tf("warnings.vehicleDetails")] : []),
    ...(template === "asset" && !special.usefulLifeYears ? [tf("warnings.assetDetails")] : []),
    ...(template === "personnel" && paymentTotal !== totals.gross ? [tf("warnings.personnelReconciliation")] : []),
  ];
  const payrollSubmissionBlocked = template === "personnel" && (
    (special.calculationMode !== "manual" && (!payrollCalculation || payrollCalculation.warnings.includes("unsupported_year")))
    || (special.calculationMode === "manual" && !String(special.overrideReason ?? "").trim())
  );

  async function save(status: "draft" | "finalized") {
    if (!categoryId) return;
    if (status === "finalized" && (!description.trim() || totals.gross <= 0)) return;
    if (payrollSubmissionBlocked) return;
    if (status === "finalized" && warnings.length > 0 && !warningOverrideReason.trim()) return;
    setPending(true);
    try {
      const effectiveDeductiblePercent = formConfig.deductibility === "vehicleBusinessUse"
        ? Math.min(100, Math.max(0, Number(special.businessUsePercent ?? 100)))
        : formConfig.deductibility === "general"
          ? deductiblePercent
          : 100;
      const input: EntryInput = {
        id: persistedEntryId ?? undefined,
        kind,
        date,
        documentDate: hasBaseField("documentDate") ? (documentDate || null) : null,
        documentNumber: hasBaseField("documentNumber") ? documentNumber : "",
        servicePeriodStart: hasBaseField("servicePeriod") ? (servicePeriodStart || null) : null,
        servicePeriodEnd: hasBaseField("servicePeriod") ? (servicePeriodEnd || null) : null,
        status,
        description: description.trim() || tf("untitledDraft"),
        counterparty: hasBaseField("counterparty") ? counterparty : paymentRecipient,
        categoryId,
        grossAmountCents: totals.gross,
        vatRate: computedLines[0]?.vatRate ?? 0,
        paymentMethod,
        notes,
        deductiblePercent: effectiveDeductiblePercent,
        warningOverrideReason,
        specialFields: Object.fromEntries(
          Object.entries(effectivePersonnelSpecial).map(([key, value]) => [key, value === "" ? null : value]),
        ),
        taxLines: computedLines,
        paymentLines,
      };
      const { id } = await upsertEntry(input);
      setPersistedEntryId(id);
      await projectLinks.persist(id).catch(() => toast.error(tp("saveError")));
      if (pendingFiles.length) {
        const failedFiles = await uploadFiles(id);
        if (failedFiles.length > 0) {
          toast.error(tf("receiptUploadPartial", {
            files: failedFiles.map((file) => file.name).join(", "),
          }));
          router.refresh();
          return;
        }
      }
      toast.success(status === "draft" ? tf("draftSaved") : tc("saved"));
      onOpenChange(false);
      window.location.reload();
    } catch {
      toast.error(tc("error"));
    } finally {
      setPending(false);
    }
  }

  async function removeEntry() {
    if (!entry || !window.confirm(entry.status === "draft" ? tf("deleteDraftConfirm") : tf("voidConfirm"))) return;
    setPending(true);
    try {
      await deleteEntry(entry.id);
      toast.success(entry.status === "draft" ? tf("draftDeleted") : tf("voided"));
      onOpenChange(false);
      window.location.reload();
    } catch {
      toast.error(tc("error"));
    } finally {
      setPending(false);
    }
  }

  return (
    <TooltipProvider>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] overflow-y-auto p-0 sm:max-w-4xl">
          {step === "category" ? (
            <EntryCategoryStep
              categories={categories}
              canManagePersonnel={canManagePersonnel}
              search={search}
              setSearch={setSearch}
              chooseCategory={chooseCategory}
            />
          ) : (
            <form onSubmit={(event) => { event.preventDefault(); void save("finalized"); }}>
              <div className="sticky top-0 z-10 border-b bg-popover/95 px-5 py-4 backdrop-blur sm:px-7">
                <button type="button" className="mb-2 inline-flex items-center gap-1 rounded-md text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setStep("category")}><ArrowLeft className="size-3.5" />{tf("changeCategory")}</button>
                <DialogHeader><p className="text-[11px] font-semibold tracking-[0.12em] text-text-tertiary uppercase">{category?.name}</p><DialogTitle className="text-xl font-semibold tracking-[-0.025em]">{entry && !isDuplicate ? t("editEntry") : t("newEntry")}</DialogTitle></DialogHeader>
              </div>
              <div className="flex flex-col gap-5 px-5 py-5 sm:px-7">
                <FormSection title={tf("bookingDetails")} description={tf("bookingDetailsDescription")}>
                  {hasBaseField("paymentDate") && <div><FieldLabel htmlFor="entry-date" help={tf("help.paymentDate")}>{t("date")}</FieldLabel><Input id="entry-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></div>}
                  {hasBaseField("documentDate") && <div><FieldLabel htmlFor="document-date">{tf("documentDate")}</FieldLabel><Input id="document-date" type="date" value={documentDate} onChange={(e) => setDocumentDate(e.target.value)} /></div>}
                  {hasBaseField("documentNumber") && <div><FieldLabel htmlFor="document-number">{tf("documentNumber")}</FieldLabel><Input id="document-number" value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} /></div>}
                  {hasBaseField("paymentMethod") && <div><FieldLabel htmlFor="payment-method">{t("paymentMethod")}</FieldLabel><Select value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as typeof paymentMethod)}><SelectTrigger id="payment-method"><SelectValue>{t(paymentMethod)}</SelectValue></SelectTrigger><SelectContent><SelectItem value="bank">{t("bank")}</SelectItem><SelectItem value="cash">{t("cash")}</SelectItem><SelectItem value="card">{t("card")}</SelectItem></SelectContent></Select></div>}
                  {hasBaseField("description") && <div className="sm:col-span-2"><FieldLabel htmlFor="entry-description">{t("description")}</FieldLabel><Input id="entry-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} /></div>}
                  {hasBaseField("counterparty") && <div className="sm:col-span-2"><FieldLabel htmlFor="entry-counterparty">{template === "grant_income" ? tf("fundingBody") : t("counterparty")}</FieldLabel><Input id="entry-counterparty" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} maxLength={200} /></div>}
                  {hasBaseField("servicePeriod") && <><div><FieldLabel htmlFor="service-start">{tf("servicePeriodStart")}</FieldLabel><Input id="service-start" type="date" value={servicePeriodStart} onChange={(e) => setServicePeriodStart(e.target.value)} /></div><div><FieldLabel htmlFor="service-end">{tf("servicePeriodEnd")}</FieldLabel><Input id="service-end" type="date" value={servicePeriodEnd} onChange={(e) => setServicePeriodEnd(e.target.value)} /></div></>}
                </FormSection>

                <EntrySpecialFields
                  template={template}
                  special={special}
                  setSpecial={setSpecial}
                  date={date}
                  documentDate={documentDate}
                  fundingProjects={fundingProjects}
                  personnelEmployees={personnelEmployees}
                  personnelLocations={personnelLocations}
                  payrollCalculation={payrollCalculation}
                  personnelCostCents={personnelCostCents}
                  paymentTotal={paymentTotal}
                />

                {formConfig.amountMode === "vat" && <section className="overflow-hidden rounded-xl border bg-card">
                  <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3"><div><h3 className="text-[14.5px] font-semibold">{tf("taxLines")}</h3><p className="text-xs leading-5 text-muted-foreground">{taxSettings.kleinunternehmer ? tf("smallBusinessTaxNotice") : tf("taxLinesDescription")}</p></div><Button type="button" variant="outline" size="sm" onClick={() => setTaxLines((current) => [...current, newLine(taxSettings.defaultVatRate, taxSettings.kleinunternehmer ? 0 : 100)])}><Plus className="size-3.5" />{tf("addTaxLine")}</Button></div>
                  <div className="divide-y divide-line-soft">{taxLines.map((line, index) => {
                    const computed = computedLines[index];
                    return <div key={line.key} className={`grid gap-3 p-4 sm:items-end ${taxLines.length > 1 ? "sm:grid-cols-[1fr_120px_110px_100px_auto]" : "sm:grid-cols-[minmax(160px,1fr)_140px_120px_auto]"}`}>
                      {taxLines.length > 1 && <div><FieldLabel htmlFor={`line-description-${line.key}`}>{tf("lineDescription")}</FieldLabel><Input id={`line-description-${line.key}`} value={line.description} onChange={(e) => setTaxLines((current) => current.map((item) => item.key === line.key ? { ...item, description: e.target.value } : item))} /></div>}
                      <div><FieldLabel htmlFor={`line-amount-${line.key}`}>{line.mode === "gross" ? t("gross") : t("net")}</FieldLabel><Input id={`line-amount-${line.key}`} inputMode="decimal" placeholder="0,00" value={line.amountText} onChange={(e) => setTaxLines((current) => current.map((item) => item.key === line.key ? { ...item, amountText: e.target.value } : item))} /></div>
                      <div><FieldLabel htmlFor={`amount-mode-${line.key}`}>{tf("amountMode")}</FieldLabel><Select value={line.mode} onValueChange={(value) => setTaxLines((current) => current.map((item) => item.key === line.key ? { ...item, mode: value as AmountMode } : item))}><SelectTrigger id={`amount-mode-${line.key}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="gross">{t("gross")}</SelectItem><SelectItem value="net">{t("net")}</SelectItem></SelectContent></Select></div>
                      <div><FieldLabel htmlFor={`vat-rate-${line.key}`} help={tf("help.vatRate")}>{t("vatRate")}</FieldLabel><Select value={String(line.vatRate)} onValueChange={(value) => setTaxLines((current) => current.map((item) => item.key === line.key ? { ...item, vatRate: Number(value) } : item))}><SelectTrigger id={`vat-rate-${line.key}`}><SelectValue /></SelectTrigger><SelectContent>{VAT_RATES.map((rate) => <SelectItem key={rate} value={String(rate)}>{rate} %</SelectItem>)}</SelectContent></Select></div>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={tc("delete")} disabled={taxLines.length === 1} onClick={() => setTaxLines((current) => current.filter((item) => item.key !== line.key))}><Trash2 className="size-4" /></Button>
                      {kind === "expense" && template !== "vehicle" && <div className="sm:col-span-2"><FieldLabel htmlFor={`input-vat-${line.key}`} help={tf("help.inputVatDeductible")}>{tf("inputVatDeductiblePercent")}</FieldLabel><Input id={`input-vat-${line.key}`} type="number" min={0} max={100} disabled={taxSettings.kleinunternehmer} value={taxSettings.kleinunternehmer ? 0 : line.inputVatDeductiblePercent} onChange={(e) => setTaxLines((current) => current.map((item) => item.key === line.key ? { ...item, inputVatDeductiblePercent: Number(e.target.value) } : item))} /></div>}
                      {computed && <p className="text-xs text-muted-foreground tabular-nums sm:col-span-2">{t("net")}: {formatCents(computed.netAmountCents, locale)} · {t("vat")}: {formatCents(computed.vatAmountCents, locale)} · {t("gross")}: {formatCents(computed.grossAmountCents, locale)}</p>}
                    </div>;
                  })}</div>
                  {formConfig.deductibility === "general" && <div className="border-t border-line-soft p-4"><div className="max-w-xs"><FieldLabel htmlFor="deductible-percent" help={template === "hospitality" ? tf("help.hospitalityDeductibility") : tf("help.deductiblePercent")}>{tf("deductiblePercent")}</FieldLabel><Input id="deductible-percent" type="number" min={0} max={100} value={deductiblePercent} onChange={(e) => setDeductiblePercent(Number(e.target.value))} /></div></div>}
                  <div className="grid grid-cols-3 gap-3 border-t bg-surface-raised px-4 py-3"><div><span className="text-[10.5px] font-semibold tracking-[0.12em] text-text-tertiary uppercase">{t("net")}</span><strong className="block tabular-nums">{formatCents(totals.net, locale)}</strong></div><div><span className="text-[10.5px] font-semibold tracking-[0.12em] text-text-tertiary uppercase">{t("vat")}</span><strong className="block tabular-nums">{formatCents(totals.vat, locale)}</strong></div><div><span className="text-[10.5px] font-semibold tracking-[0.12em] text-text-tertiary uppercase">{t("gross")}</span><strong className="block tabular-nums">{formatCents(totals.gross, locale)}</strong></div></div>
                </section>}

                {formConfig.amountMode === "gross" && <FormSection title={tf("amount")} description={tf("grossAmountDescription")}>
                  <div><FieldLabel htmlFor={`line-amount-${taxLines[0].key}`} help={tf("help.nonVatAmount")}>{t("gross")}</FieldLabel><Input id={`line-amount-${taxLines[0].key}`} inputMode="decimal" placeholder="0,00" value={taxLines[0].amountText} onChange={(e) => setTaxLines((current) => current.map((item, index) => index === 0 ? { ...item, amountText: e.target.value, vatRate: 0, mode: "gross" } : item))} /></div>
                  {formConfig.deductibility === "general" && <div><FieldLabel htmlFor="deductible-percent" help={tf("help.taxDeductibility")}>{tf("deductiblePercent")}</FieldLabel><Input id="deductible-percent" type="number" min={0} max={100} value={deductiblePercent} onChange={(e) => setDeductiblePercent(Number(e.target.value))} /></div>}
                  <div className="flex items-center justify-between rounded-lg border bg-surface-raised px-4 py-3 sm:col-span-2"><span>{tf("bookingTotal")}</span><strong className="font-semibold tabular-nums">{formatCents(totals.gross, locale)}</strong></div>
                </FormSection>}

                <FormSection title={tf("supportingInformation")} description={tf("supportingInformationDescription")}>
                  <div><FieldLabel htmlFor="entry-notes">{t("notes")}</FieldLabel><Textarea id="entry-notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} /></div>
                  <div><FieldLabel htmlFor="receipt-files">{t("receipts")}</FieldLabel><div className="mt-1 flex flex-col gap-1">{existingAttachments.map((attachment) => <div key={attachment.id} className="flex items-center gap-2 text-sm"><Paperclip className="size-3.5" /><a className="min-w-0 flex-1 truncate hover:underline" href={`/api/files/${attachment.id}`} target="_blank" rel="noreferrer">{attachment.fileName}</a>{entry?.status !== "finalized" && <Button type="button" variant="ghost" size="icon-xs" aria-label={tc("delete")} onClick={() => void removeExistingAttachment(attachment.id)}><X className="size-3.5" /></Button>}</div>)}{pendingFiles.map((file, index) => <div key={`${file.name}-${index}`} className="flex items-center gap-2 text-sm text-muted-foreground"><Upload className="size-3.5" /><span className="min-w-0 flex-1 truncate">{file.name}</span><Button type="button" variant="ghost" size="icon-xs" aria-label={tc("delete")} onClick={() => setPendingFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X className="size-3.5" /></Button></div>)}</div><input id="receipt-files" ref={fileInputRef} type="file" accept="application/pdf,image/png,image/jpeg,image/webp,image/heic" multiple className="hidden" onChange={(event) => { const files = Array.from(event.currentTarget.files ?? []); setPendingFiles((current) => [...current, ...files]); event.currentTarget.value = ""; }} /><Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => fileInputRef.current?.click()}><Upload className="size-4" />{t("uploadReceipt")}</Button></div>
                </FormSection>

                <div className="flex flex-col gap-1.5"><FieldLabel>{tp("projects")}</FieldLabel><ProjectPicker value={projectLinks.value} onChange={projectLinks.onChange} disabled={projectLinks.loading} /></div>

                {entry && !isDuplicate && <EvidencePanel targetType="accountingEntry" targetId={entry.id} />}

                {warnings.length > 0 && <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-4"><h3 className="flex items-center gap-2 text-[14.5px] font-semibold text-destructive"><TriangleAlert className="size-4" aria-hidden="true" />{tf("warnings.title")}</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-text-secondary">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul><div className="mt-3"><FieldLabel htmlFor="warning-reason">{tf("warnings.overrideReason")}</FieldLabel><Textarea id="warning-reason" rows={2} value={warningOverrideReason} onChange={(e) => setWarningOverrideReason(e.target.value)} placeholder={tf("warnings.overridePlaceholder")} /></div></section>}
              </div>
              <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t bg-popover/95 px-5 py-4 backdrop-blur sm:px-7">
                {entry && !isDuplicate && <Button type="button" variant="destructive" size="sm" disabled={pending} onClick={() => void removeEntry()}><Trash2 className="size-4" />{entry.status === "draft" ? tf("deleteDraft") : tf("voidEntry")}</Button>}
                {entry && template === "personnel" && !isDuplicate && <Button type="button" variant="outline" size="sm" disabled={pending} onClick={duplicatePersonnelMonth}>{tf("duplicatePersonnelMonth")}</Button>}
                <div className="ml-auto flex gap-2">{entry?.status !== "finalized" && <Button type="button" variant="outline" disabled={pending || payrollSubmissionBlocked} onClick={() => void save("draft")}>{tf("saveDraft")}</Button>}<Button type="submit" disabled={pending || payrollSubmissionBlocked || !description.trim() || totals.gross <= 0 || (warnings.length > 0 && !warningOverrideReason.trim())}>{pending && <Loader2 className="size-4 animate-spin" />}{tf("finalize")}</Button></div>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
