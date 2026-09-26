// One row of summary chips under the project title. Each chip opens the place
// behind the number. Used by the project page header.
import type { ReactNode } from "react";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Clock3,
  Diamond,
  Landmark,
  Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProjectPulse } from "../pulse";

function Chip({
  href,
  icon,
  children,
  title,
  tone,
}: {
  href?: string;
  icon: ReactNode;
  children: ReactNode;
  title?: string;
  tone?: "danger" | "success";
}) {
  const className = cn(
    "inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border bg-background px-2.5 text-xs font-medium text-muted-foreground",
    href && "transition-colors hover:border-foreground/25 hover:bg-muted hover:text-foreground",
    tone === "danger" && "border-destructive/30 bg-destructive/5 text-destructive hover:text-destructive",
    tone === "success" && "text-emerald-700 dark:text-emerald-400",
  );
  const content = (
    <>
      <span className="shrink-0 [&_svg]:size-3.5">{icon}</span>
      <span className="truncate">{children}</span>
    </>
  );
  return href ? (
    <Link href={href} className={className} title={title}>
      {content}
    </Link>
  ) : (
    <span className={className} title={title}>
      {content}
    </span>
  );
}

function formatHours(minutes: number) {
  const hours = minutes / 60;
  return hours >= 10 || Number.isInteger(hours) ? String(Math.round(hours)) : hours.toFixed(1).replace(".", ",");
}

export async function ProjectPulseChips({ projectId, pulse }: { projectId: string; pulse: ProjectPulse }) {
  const t = await getTranslations("projectLinks.pulse");
  const format = await getFormatter();
  const base = `/projects/${encodeURIComponent(projectId)}`;

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label={t("label")}>
      {pulse.open === 0 && pulse.done > 0 ? (
        <Chip icon={<CheckCircle2 />} tone="success">{t("allDone")}</Chip>
      ) : (
        <Chip href={base} icon={<CircleDot />}>{t("open", { count: pulse.open })}</Chip>
      )}
      {pulse.overdue > 0 && (
        <Chip href={base} icon={<AlertTriangle />} tone="danger">{t("overdue", { count: pulse.overdue })}</Chip>
      )}
      {pulse.next && (
        <Chip
          href={`${base}?task=${encodeURIComponent(pulse.next.id)}`}
          icon={pulse.next.milestone ? <Diamond /> : <CalendarClock />}
          title={pulse.next.title}
        >
          {t("next", {
            title: pulse.next.title,
            date: format.dateTime(new Date(`${pulse.next.dueDate}T00:00:00`), { day: "numeric", month: "short" }),
          })}
        </Chip>
      )}
      <Chip
        href={`/time?project=${encodeURIComponent(projectId)}`}
        icon={<Clock3 />}
        title={pulse.hoursScope === "team" ? t("hoursTeamHint") : t("hoursOwnHint")}
      >
        {t(pulse.hoursScope === "team" ? "hoursTeam" : "hoursOwn", { hours: formatHours(pulse.monthMinutes) })}
      </Chip>
      <Chip href={`${base}?view=knowledge`} icon={<BookOpen />}>{t("knowledge", { count: pulse.knowledgeCount })}</Chip>
      {pulse.connectionCount > 0 && (
        <Chip href={`${base}?view=knowledge#connections`} icon={<Link2 />}>
          {t("connections", { count: pulse.connectionCount })}
        </Chip>
      )}
      {pulse.funding.map((funding) => (
        <Chip key={funding.id} href={`/accounting/funding-projects/${encodeURIComponent(funding.id)}`} icon={<Landmark />} title={t("fundingHint")}>
          {funding.name}
        </Chip>
      ))}
    </div>
  );
}
