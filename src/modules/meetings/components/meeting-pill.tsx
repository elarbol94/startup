import { cn } from "@/lib/utils";

// Status pills (design 1b): Entwurf = slate, Freigegeben = green, live call = destructive,
// in progress = brand-soft. There are no --status-* tokens in globals.css yet, so the 1b
// values (as in accounting's invoice-status-badge) live here.
const TONES = {
  neutral: "bg-muted text-text-secondary",
  active: "bg-brand-soft text-brand-ink",
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  ok: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  live: "bg-destructive/15 text-destructive",
  negative: "bg-destructive/10 text-destructive",
  line: "border border-line-strong font-medium text-text-secondary",
} as const;

export type MeetingPillTone = keyof typeof TONES;

export const meetingStatusTone: Record<string, MeetingPillTone> = {
  scheduled: "neutral",
  processing: "active",
  review: "draft",
  approved: "ok",
  cancelled: "negative",
};

export const protocolStateTone: Record<string, MeetingPillTone> = {
  none: "line",
  draft: "draft",
  approved: "ok",
};

export function MeetingPill({ tone, className, children }: { tone: MeetingPillTone; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex h-5 w-fit shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-semibold whitespace-nowrap [&>svg]:size-3", TONES[tone], className)}>
      {children}
    </span>
  );
}

/** Pulsing "call running" pill. */
export function LivePill({ children }: { children: React.ReactNode }) {
  return (
    <MeetingPill tone="live">
      <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden />
      {children}
    </MeetingPill>
  );
}
