"use client";

import { useCallback, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { RotateCcw, Trash2, TriangleAlert, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { MEETING_MEDIA_TYPES } from "../../constants";
import { deleteMeetingRecording, retryMeetingJob } from "../../meeting-actions";
import type { MeetingDetail } from "../../queries";
import { formatBytes, formatClock, useMeetingAction } from "../meeting-ui";
import { useChunkedUpload } from "./use-chunked-upload";

const EXTENSION_TYPES: Record<string, string> = {
  mp4: "video/mp4", webm: "video/webm", mkv: "video/x-matroska", m4a: "audio/mp4", mp3: "audio/mpeg",
  ogg: "audio/ogg", opus: "audio/ogg", wav: "audio/wav",
};

/** Browsers leave `type` empty for some containers; fall back to the extension. */
function mediaType(file: File) {
  if (file.type && MEETING_MEDIA_TYPES[file.type]) return file.type;
  return EXTENSION_TYPES[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? file.type;
}

export function RecordingsPanel({ detail }: { detail: MeetingDetail }) {
  const t = useTranslations("meetings");
  const format = useFormatter();
  const router = useRouter();
  const id = useId();
  const { pending, run } = useMeetingAction();
  const [confirmElement, confirm] = useConfirm();
  const onDone = useCallback(() => router.refresh(), [router]);
  const { progress, upload, cancel, reset } = useChunkedUpload(onDone);
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [informed, setInformed] = useState(false);
  const [aiConsent, setAiConsent] = useState(false);
  const usesAi = detail.meeting.aiPolicy === "openai";
  const canContribute = detail.role !== "viewer";
  const canManage = detail.role === "host";
  const originals = detail.recordings.filter((recording) => recording.kind !== "derived_audio");
  const derivedFor = (recordingId: string) => detail.recordings.find((recording) => recording.sourceRecordingId === recordingId);

  function start() {
    if (!file) return;
    const typed = new File([file], file.name, { type: mediaType(file) });
    void upload(detail.meeting.id, typed, { participantsInformed: informed, aiProcessing: aiConsent });
    setFile(null);
    setInformed(false);
    setAiConsent(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function remove(recordingId: string) {
    if (!await confirm({ title: t("recordings.deleteTitle"), description: t("recordings.deleteDescription"), confirmLabel: t("recordings.delete"), destructive: true })) return;
    run(() => deleteMeetingRecording(recordingId));
  }

  return (
    <div className="space-y-5">
      {confirmElement}
      {canContribute && detail.meeting.status !== "cancelled" && (
        <section className="space-y-3 rounded-xl border p-4">
          <h3 className="font-medium">{t("recordings.uploadTitle")}</h3>
          {progress.phase === "uploading" ? (
            <div className="space-y-2">
              <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={progress.totalBytes} aria-valuenow={progress.sentBytes}>
                <div className="h-full bg-primary transition-all" style={{ width: `${Math.round((progress.sentBytes / Math.max(1, progress.totalBytes)) * 100)}%` }} />
              </div>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{formatBytes(progress.sentBytes)} / {formatBytes(progress.totalBytes)}</span>
                <Button size="sm" variant="ghost" onClick={cancel}>{t("recordings.cancelUpload")}</Button>
              </div>
            </div>
          ) : (
            <>
              {progress.phase === "processing" && <p className="text-sm text-muted-foreground">{t("recordings.uploaded")}</p>}
              {progress.phase === "error" && (
                <p className="text-sm text-destructive" role="alert">
                  {t.has(`uploadErrors.${progress.code}`) ? t(`uploadErrors.${progress.code}`) : t("uploadErrors.generic")}
                  {" "}<Button size="sm" variant="link" className="h-auto p-0" onClick={reset}>{t("recordings.dismiss")}</Button>
                </p>
              )}
              <input
                ref={fileInput}
                id={`${id}-file`}
                type="file"
                accept={[...Object.keys(MEETING_MEDIA_TYPES), ".mkv", ".m4a", ".opus"].join(",")}
                className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              <label className="flex items-start gap-2 text-sm">
                <Checkbox className="mt-0.5" checked={informed} onCheckedChange={(checked) => setInformed(checked === true)} />
                <span>{t("recordings.declarationInformed")}</span>
              </label>
              {usesAi && (
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox className="mt-0.5" checked={aiConsent} onCheckedChange={(checked) => setAiConsent(checked === true)} />
                  <span>{t("recordings.declarationAi")}</span>
                </label>
              )}
              <Button onClick={start} disabled={!file || !informed || (usesAi && !aiConsent)}><Upload />{t("recordings.upload")}</Button>
            </>
          )}
        </section>
      )}

      {detail.uploads.filter((item) => item.state !== "aborted").map((item) => (
        <p key={item.id} className="text-sm text-muted-foreground">{t("recordings.assembling", { name: item.fileName })}</p>
      ))}
      {detail.uploads.filter((item) => item.state === "aborted" && item.error).map((item) => (
        <p key={item.id} className="text-sm text-destructive">{t("recordings.uploadFailed", { name: item.fileName, error: item.error })}</p>
      ))}

      {detail.jobs.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-medium">{t("jobs.title")}</h3>
          <ul className="divide-y rounded-xl border text-sm">
            {detail.jobs.map((job) => (
              <li key={job.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span>{t(`jobs.stage.${job.stage}`)}</span>
                <span className="flex items-center gap-2">
                  <Badge variant={job.status === "failed" || job.status === "blocked" ? "destructive" : "secondary"}>{t(`jobs.status.${job.status}`)}</Badge>
                  {(job.status === "failed" || job.status === "blocked") && canContribute && (
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => retryMeetingJob(job.id))}><RotateCcw />{t("jobs.retry")}</Button>
                  )}
                </span>
                {job.lastError && job.status !== "queued" && <p className="w-full text-xs text-muted-foreground">{job.lastError}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="font-medium">{t("recordings.title")}</h3>
        {originals.length === 0 ? <p className="text-sm text-muted-foreground">{t("recordings.empty")}</p> : (
          <ul className="space-y-3">
            {originals.map((recording) => {
              const derived = derivedFor(recording.id);
              const playable = recording.purgeState === "active" && recording.attachmentId ? recording : derived?.purgeState === "active" && derived.attachmentId ? derived : null;
              return (
                <li key={recording.id} className="space-y-2 rounded-xl border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 text-sm">
                      <p className="truncate font-medium" title={recording.fileName}>
                        {recording.source === "livekit" ? t("recordings.callTrack", {
                          name: recording.speakerName ?? t("recordings.unknownSpeaker"),
                          time: format.dateTime(new Date(recording.mediaStartedAt ?? recording.createdAt), { dateStyle: "medium", timeStyle: "short" }),
                        }) : recording.fileName}
                      </p>
                      <p className="text-muted-foreground">
                        {recording.durationMs ? formatClock(recording.durationMs) : "–"} · {formatBytes(recording.sizeBytes)}
                        {recording.expiresAt && recording.purgeState === "active" ? ` · ${t("recordings.expires", { date: format.dateTime(recording.expiresAt, { dateStyle: "medium" }) })}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {recording.warnings.length > 0 && <Badge variant="outline" className="border-amber-500/60 text-amber-700 dark:text-amber-400"><TriangleAlert />{t("recordings.check")}</Badge>}
                      {recording.purgeState !== "active" && <Badge variant="outline">{t(`recordings.purge.${recording.purgeState}`)}</Badge>}
                      {canManage && recording.purgeState === "active" && (
                        <Button size="icon-sm" variant="ghost" aria-label={t("recordings.delete")} disabled={pending} onClick={() => void remove(recording.id)}><Trash2 /></Button>
                      )}
                    </div>
                  </div>
                  {recording.warnings.map((warning) => (
                    <p key={warning} className="text-xs text-amber-700 dark:text-amber-400" role="status">{t(`recordings.warnings.${warning}`)}</p>
                  ))}
                  {playable && (playable.kind === "video" && playable.mimeType?.startsWith("video/")
                    ? <video controls preload="metadata" className="max-h-80 w-full rounded-lg bg-black" src={`/api/files/${playable.attachmentId}`} />
                    : <audio controls preload="metadata" className="w-full" src={`/api/files/${playable.attachmentId}`} />)}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
