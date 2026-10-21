"use client";
// The building blocks of the ribbon, after PowerPoint: a group is a column of controls with its
// name underneath (and an optional dialog launcher), a large button stacks its icon over a
// label, small buttons sit in rows of two or three.
import type { ComponentProps, ReactNode } from "react";
import { ChevronDown, SquareArrowOutDownRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EditorSearchCommand } from "../../editor-command-search";
import { cn } from "@/lib/utils";

type RibbonButtonProps = Omit<ComponentProps<typeof Button>, "size" | "variant"> & {
  icon?: ReactNode; label: string; large?: boolean; caret?: boolean; active?: boolean;
  /** Icon-only buttons still name themselves for screen readers and tooltips. */
  iconOnly?: boolean; shortcut?: string;
};

export function RibbonButton({ icon, label, large, caret, active, iconOnly, shortcut, className, children, title, ...props }: RibbonButtonProps) {
  const tip = title ?? (shortcut ? `${label} (${shortcut})` : label);
  return <Button type="button" variant={active ? "secondary" : "ghost"} aria-pressed={active} title={tip} aria-label={iconOnly ? label : undefined} {...props}
    className={cn(large
      ? "h-[70px] min-w-12 flex-col justify-start gap-1 px-1.5 pt-1.5 pb-1 text-xs leading-tight font-normal whitespace-normal [&_svg:not([class*='size-'])]:size-6"
      : "h-[22px] gap-1 rounded-md px-1.5 text-xs font-normal @max-6xl/ribbon:px-1 [&_svg:not([class*='size-'])]:size-4", iconOnly && !large && "w-[26px] px-0", className)}>
    {children ?? <>
      {icon}
      {/* Like PowerPoint's ribbon scaling: on a narrow ribbon, small buttons keep only their icon. */}
      {!iconOnly && <span className={cn(large ? "line-clamp-2 max-w-24 shrink-0 text-center hyphens-auto wrap-anywhere" : icon && "@max-6xl/ribbon:sr-only")}>
        {label}{large && caret && <ChevronDown className="ml-0.5 inline size-3! align-middle text-muted-foreground" />}
      </span>}
      {caret && (!large || iconOnly) && <ChevronDown className="size-3! text-muted-foreground" />}
    </>}
  </Button>;
}

/** A ribbon button bound to an editor command: its label, shortcut, availability and state. */
export function CommandButton({ command, run, shortcuts, ...props }: Omit<RibbonButtonProps, "label"> & {
  command: EditorSearchCommand | undefined; run: (id: string) => void; shortcuts: Record<string, string>; label?: string;
}) {
  if (!command) return null;
  return <RibbonButton {...props} label={props.label ?? command.label} shortcut={shortcuts[command.id]} active={props.active ?? command.active}
    disabled={props.disabled || Boolean(command.disabledReason)} onClick={() => run(command.id)} data-command={command.id} />;
}

export function RibbonGroup({ label, launcher, children, className }: {
  label: string; children: ReactNode; className?: string;
  /** PowerPoint's dialog launcher: the small arrow that opens the full settings for a group. */
  launcher?: { label: string; onClick: () => void; disabled?: boolean; testId?: string };
}) {
  return <div role="group" aria-label={label} className={cn("flex h-full shrink-0 flex-col border-r border-border/60 px-1.5 last:border-r-0", className)}>
    <div className="flex min-h-0 flex-1 items-start gap-0.5">{children}</div>
    <div className={cn("relative flex h-4 items-center justify-center text-[11px] leading-none text-muted-foreground", launcher && "px-4")}>
      <span className="truncate">{label}</span>
      {launcher && <button type="button" aria-label={launcher.label} title={launcher.label} disabled={launcher.disabled} data-testid={launcher.testId} onClick={launcher.onClick}
        className="absolute right-0 grid size-4 place-items-center rounded-sm hover:bg-muted disabled:opacity-40"><SquareArrowOutDownRight className="size-3" /></button>}
    </div>
  </div>;
}

/** Up to three rows of small controls. */
export function RibbonStack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col justify-center gap-0.5 self-stretch py-0.5", className)}>{children}</div>;
}

export function RibbonRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex items-center gap-0.5", className)}>{children}</div>;
}
