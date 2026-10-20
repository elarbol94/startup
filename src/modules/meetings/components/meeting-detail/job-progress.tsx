"use client";

import { useTranslations } from "next-intl";
import { protocolSections } from "../../job-progress";
import type { MeetingDetail } from "../../queries";
import { formatClock } from "../meeting-ui";
import { MeetingPill } from "../meeting-pill";

type Job = MeetingDetail["jobs"][number];
type Progress = NonNullable<Job["progress"]>;

/** Stages a person waits for before transcript and protocol appear. */
const PIPELINE_STAGES = new Set<Job["stage"]>(["ingest", "extract_audio", "transcribe", "merge", "protocol"]);

export function JobProgressBar({ progress }: { progress: Progress }) {
  const t = useTranslations("meetings.jobs.progress");
  const percent = progress.fraction === null ? null : Math.round(progress.fraction * 100);
  const elapsed = formatClock(progress.elapsedMs);
  let label: string;
  switch (progress.step) {
    case "transcribing": {
      label = t("transcribing", {
        part: progress.part ?? 1, parts: progress.parts ?? 1,
        done: formatClock(progress.doneMs ?? 0), total: formatClock(progress.totalMs ?? 0),
      });
      if (progress.remainingMs != null) {
        label += ` · ${progress.remainingMs < 60_000 ? t("almostDone") : t("remaining", { minutes: Math.ceil(progress.remainingMs / 60_000) })}`;
      }
      break;
    }
    case "writing": {
      const index = protocolSections.indexOf(progress.section ?? "summary");
      label = t("writing", { section: t(`sections.${progress.section ?? "summary"}`), number: index + 1, count: protocolSections.length });
      break;
    }
    default:
      label = t(progress.step, { elapsed });
  }
  return (
    <div className="w-full space-y-1">
      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
      >
        {percent === null
          ? <div className="h-full w-full animate-pulse bg-brand/40" />
          : <div className="h-full bg-brand transition-[width] duration-1000 ease-linear" style={{ width: `${Math.max(2, percent)}%` }} />}
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">{percent !== null && `${percent} % · `}{label}</p>
    </div>
  );
}

/** Queued and running work until transcript and protocol are ready, with progress. */
export function PipelineProgress({ jobs }: { jobs: Job[] }) {
  const t = useTranslations("meetings");
  const active = jobs.filter((job) => PIPELINE_STAGES.has(job.stage) && (job.status === "queued" || job.status === "running"));
  if (!active.length) return null;
  return (
    <section className="space-y-2 rounded-xl border bg-surface-raised px-[18px] py-3" aria-live="polite">
      <h3 className="text-[11px] font-semibold tracking-[0.12em] text-text-tertiary uppercase">{t("jobs.title")}</h3>
      <ul className="space-y-3 text-[13.5px]">
        {active.map((job) => (
          <li key={job.id} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span>{t(`jobs.stage.${job.stage}`)}</span>
              <MeetingPill tone={job.status === "running" ? "active" : "neutral"}>{t(`jobs.status.${job.status}`)}</MeetingPill>
            </div>
            {job.progress && <JobProgressBar progress={job.progress} />}
          </li>
        ))}
      </ul>
    </section>
  );
}
