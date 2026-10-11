import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

// Design 1b building blocks for the network screens: card, card header, list rows, pills.

export const networkCardClass = "overflow-hidden rounded-xl border bg-card shadow-card";
export const networkListClass = "divide-y divide-line-soft";
export const networkRowClass = "px-[18px] py-[11px] text-[13.5px]";
export const networkLabelClass = "text-[11px] font-semibold tracking-[0.12em] text-text-tertiary uppercase";

/** Card with a 1b header (title, muted count, right-aligned actions). */
export function NetworkCard({
  title,
  titleId,
  heading: Heading = "h3",
  count,
  icon,
  actions,
  className,
  children,
  ...props
}: Omit<ComponentProps<"section">, "title"> & {
  title?: ReactNode;
  titleId?: string;
  heading?: "h2" | "h3";
  count?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className={cn(networkCardClass, className)} {...props}>
      {title ? (
        <header className="flex min-h-[52px] flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-line-soft px-[18px] py-2.5">
          {icon}
          <Heading id={titleId} className="text-sm font-semibold">{title}</Heading>
          {count !== undefined && count !== null ? <span className="text-xs text-muted-foreground tabular-nums">{count}</span> : null}
          {actions ? <div className="ml-auto flex flex-wrap items-center gap-1.5">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

/** One muted line inside a card when its list is empty. */
export function NetworkCardEmpty({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn(networkRowClass, "text-muted-foreground", className)}>{children}</p>;
}

const PILL_TONES = {
  neutral: "bg-muted text-text-secondary",
  brand: "bg-brand-soft text-brand-ink",
  line: "border border-line-strong font-medium text-text-secondary",
} as const;

/** 1b pill: 20 px, full radius, 11 px semibold. */
export function NetworkPill({
  tone = "neutral",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: keyof typeof PILL_TONES }) {
  return (
    <span
      className={cn("inline-flex h-5 w-fit shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-semibold whitespace-nowrap", PILL_TONES[tone], className)}
      {...props}
    />
  );
}
