"use client";

import { cloneElement, isValidElement, useId, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Native select styled like `Input` (design 1b: 10 px radius, brand focus ring). */
export const selectClassName =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  const generatedId = useId();
  if (!isValidElement<{ id?: string }>(children)) {
    return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
  }
  const control = children as ReactElement<{ id?: string }>;
  const id = control.props.id ?? generatedId;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {cloneElement(control, { id })}
    </div>
  );
}

/** 1b card: 12 px radius, hairline border, light-mode shadow. */
export function Panel({ className, children, ...props }: ComponentProps<"section">) {
  return <section className={cn("min-w-0 overflow-hidden rounded-xl border bg-card shadow-card", className)} {...props}>{children}</section>;
}

/** 1b card header (≈52 px): title, muted count/meta, right-aligned actions, hairline below. */
export function PanelHeader({ title, meta, actions, className }: { title: ReactNode; meta?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={cn("flex min-h-[52px] flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-line-soft px-[18px] py-3", className)}>
      <h2 className="text-[14.5px] font-semibold">{title}</h2>
      {meta ? <span className="min-w-0 text-xs text-muted-foreground">{meta}</span> : null}
      {actions ? <div className="ml-auto flex items-center gap-1.5">{actions}</div> : null}
    </header>
  );
}

/** Uppercase group label (eyebrow style inside cards). */
export function GroupLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-[11px] font-semibold tracking-[0.12em] text-text-tertiary uppercase", className)}>{children}</p>;
}

type PillTone = "active" | "neutral" | "outline" | "late";
const pillTones: Record<PillTone, string> = {
  active: "bg-brand-soft text-brand-ink",
  neutral: "bg-muted text-text-secondary",
  outline: "border border-line-strong font-medium text-text-secondary",
  late: "bg-destructive/15 text-destructive",
};

/** 1b pill: 20 px, full radius, 11 px semibold. */
export function Pill({ tone = "neutral", className, children, ...props }: ComponentProps<"span"> & { tone?: PillTone }) {
  return (
    <span
      className={cn("inline-flex h-5 w-fit shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-semibold whitespace-nowrap [&_svg]:size-3", pillTones[tone], className)}
      {...props}
    >
      {children}
    </span>
  );
}

export type Kpi = { label: string; value: string; negative?: boolean };

/** KPI strip: one bordered card, tiles separated by hairlines (label 12 px muted, value 24 px). */
export function KpiStrip({ items, className, tileClassName, valueClassName }: { items: Kpi[]; className?: string; tileClassName?: string; valueClassName?: string }) {
  return (
    <div className={cn("grid overflow-hidden", className)}>
      {items.map((item) => (
        <div key={item.label} className={cn("min-w-0 px-[18px] py-4 shadow-[1px_0_0_var(--border),0_1px_0_var(--border)]", tileClassName)}>
          <p className="truncate text-xs text-muted-foreground">{item.label}</p>
          <p className={cn("mt-2 truncate text-2xl leading-tight font-semibold tracking-[-0.02em] tabular-nums", item.negative && "text-late", valueClassName)}>{item.value}</p>
        </div>
      ))}
    </div>
  );
}

export function MonthSelect({ id, name, year, locale, label, defaultMonth = 7 }: { id?: string; name?: string; year: number; locale: string; label: string; defaultMonth?: number }) {
  const formatter = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" });
  return <select id={id} name={name} aria-label={label} required defaultValue={`${year}-${String(defaultMonth).padStart(2, "0")}`} className={selectClassName}>
    {Array.from({ length: 12 }, (_, index) => {
      const value = `${year}-${String(index + 1).padStart(2, "0")}`;
      return <option key={value} value={value}>{formatter.format(new Date(Date.UTC(year, index, 1)))}</option>;
    })}
  </select>;
}
