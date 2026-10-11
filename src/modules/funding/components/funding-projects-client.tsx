"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, HandCoins, Landmark, Plus } from "lucide-react";
import { formatCents } from "@/lib/money";
import type { FundingProjectListRow } from "@/modules/funding/queries";
import { FundingProjectDialog } from "./project-dialog";
import { AccountingPageHeader } from "@/modules/accounting/components/accounting-page-header";
import { Button } from "@/components/ui/button";
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip";
import { useKeyboardShortcut } from "@/components/use-keyboard-shortcut";
import { SECTION_PAGE_SHORTCUTS } from "@/lib/app-shortcuts";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function FundingProjectsClient({
  projects,
  templates,
}: {
  projects: FundingProjectListRow[];
  templates: Array<{ id: string; name: string }>;
}) {
  const t = useTranslations("fundingProjects");
  const locale = useLocale();
  const [dialogOpen, setDialogOpen] = useState(false);
  useKeyboardShortcut(SECTION_PAGE_SHORTCUTS.funding.newProject, () => setDialogOpen(true));
  const totals = useMemo(
    () =>
      projects.reduce(
        (sum, project) => ({
          costs: sum.costs + project.totalProjectCostCents,
          requested: sum.requested + project.requestedGrantCents,
          approved: sum.approved + project.approvedFundingCents,
        }),
        { costs: 0, requested: 0, approved: 0 },
      ),
    [projects],
  );

  return (
    <div className="grid gap-5">
      <AccountingPageHeader
        className="mb-0"
        title={t("title")}
        description={t("subtitle")}
        actions={
          <ShortcutTooltip label={t("newProject")} shortcut={SECTION_PAGE_SHORTCUTS.funding.newProject}>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="size-4" />
              {t("newProject")}
            </Button>
          </ShortcutTooltip>
        }
      />

      <div className="grid grid-cols-2 overflow-hidden rounded-xl border bg-card shadow-card sm:grid-cols-3">
        <SummaryTile label={t("summary.totalCost")} value={formatCents(totals.costs, locale)} />
        <SummaryTile label={t("summary.requested")} value={formatCents(totals.requested, locale)} />
        <SummaryTile label={t("summary.approved")} value={formatCents(totals.approved, locale)} />
      </div>

      <section className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-card">
        <header className="flex items-center gap-2.5 border-b border-line-soft px-[18px] py-3.5">
          <Landmark className="size-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-[15px] font-semibold">{t("portfolio")}</h2>
          {projects.length > 0 ? (
            <span className="text-xs text-muted-foreground tabular-nums">{projects.length}</span>
          ) : null}
        </header>
          {projects.length === 0 ? (
            <EmptyState
              icon={<HandCoins />}
              title={t("empty.title")}
              description={t("empty.description")}
            />
          ) : (
            <>
            <ul className="divide-y divide-line-soft md:hidden">
              {projects.map((project) => (
                <li key={project.id}>
                <Link href={`/accounting/funding-projects/${project.id}`} className="block px-[18px] py-3.5 text-[13.5px] transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold">{project.name}</h3>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{project.fundingBody} · {project.programName || project.templateName || t("customTemplate")}</p>
                    </div>
                    <StatusBadge status={project.status} label={t(`status.${project.status}`)} />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
                    <div><dt className="text-muted-foreground">{t("summary.totalCost")}</dt><dd className="mt-0.5 font-semibold tabular-nums">{formatCents(project.totalProjectCostCents, locale)}</dd></div>
                    <div><dt className="text-muted-foreground">{t("summary.approved")}</dt><dd className="mt-0.5 font-semibold tabular-nums">{formatCents(project.approvedFundingCents, locale)}</dd></div>
                    <div><dt className="text-muted-foreground">{t("summary.requested")}</dt><dd className="mt-0.5 font-medium tabular-nums">{formatCents(project.requestedGrantCents, locale)}</dd></div>
                    <div><dt className="text-muted-foreground">{t("summary.ownFunds")}</dt><dd className="mt-0.5 font-medium tabular-nums">{formatCents(project.requiredOwnFundsCents, locale)}</dd></div>
                  </dl>
                </Link>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
            <Table className="text-[13.5px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent [&>th]:h-9 [&>th]:text-[11.5px] [&>th]:font-medium [&>th]:text-muted-foreground">
                  <TableHead className="pl-[18px]">{t("fields.name")}</TableHead>
                  <TableHead>{t("fields.fundingBody")}</TableHead>
                  <TableHead>{t("fields.status")}</TableHead>
                  <TableHead className="text-right">{t("summary.totalCost")}</TableHead>
                  <TableHead className="text-right">{t("summary.requested")}</TableHead>
                  <TableHead className="text-right">{t("summary.approved")}</TableHead>
                  <TableHead className="text-right">{t("summary.ownFunds")}</TableHead>
                  <TableHead className="pr-[18px]"><span className="sr-only">{t("openProject")}</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((project) => (
                  <TableRow key={project.id} className="h-[42px] border-line-soft hover:bg-accent">
                    <TableCell className="pl-[18px]">
                      <div className="min-w-48">
                        <Link href={`/accounting/funding-projects/${project.id}`} className="font-medium hover:underline">
                          {project.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{project.programName || project.templateName || t("customTemplate")}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{project.fundingBody}</TableCell>
                    <TableCell><StatusBadge status={project.status} label={t(`status.${project.status}`)} /></TableCell>
                    <MoneyCell value={project.totalProjectCostCents} locale={locale} />
                    <MoneyCell value={project.requestedGrantCents} locale={locale} />
                    <MoneyCell value={project.approvedFundingCents} locale={locale} />
                    <MoneyCell value={project.requiredOwnFundsCents} locale={locale} />
                    <TableCell className="pr-[18px] text-right">
                      <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link href={`/accounting/funding-projects/${project.id}`} aria-label={t("openProject")} />}>
                        <ArrowRight className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
            </>
          )}
      </section>

      <FundingProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} project={null} templates={templates} />
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-[18px] py-4 shadow-[1px_0_0_var(--border),0_1px_0_var(--border)] first:col-span-2 sm:first:col-span-1">
      <p className="truncate text-[11px] font-semibold tracking-[0.12em] text-text-tertiary uppercase">{label}</p>
      <p className="mt-2 truncate text-lg leading-tight font-semibold tracking-[-0.02em] tabular-nums sm:text-[22px]">{value}</p>
    </div>
  );
}

function MoneyCell({ value, locale }: { value: number; locale: string }) {
  return <TableCell className="text-right font-medium tabular-nums">{formatCents(value, locale)}</TableCell>;
}

/** Funding project status as a 1b pill: running/approved in brand, rejected destructive, rest neutral. */
export function StatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center rounded-full px-2 text-[11px] font-semibold whitespace-nowrap",
        status === "rejected"
          ? "bg-destructive/15 text-destructive"
          : status === "active" || status === "approved"
            ? "bg-brand-soft text-brand-ink"
            : "bg-muted text-text-secondary",
      )}
    >
      {label}
    </span>
  );
}
