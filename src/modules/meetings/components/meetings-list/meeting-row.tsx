"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { CheckCircle2, FileText, ListTodo, Lock, Mic, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { MeetingListItem } from "../../queries";

/** Shown by name in the list; the rest is summarised as "+n". */
const VISIBLE_PARTICIPANTS = 3;

export function MeetingRow({ meeting }: { meeting: MeetingListItem }) {
  const t = useTranslations("meetings");
  const format = useFormatter();
  const shown = meeting.participants.slice(0, VISIBLE_PARTICIPANTS);
  const hidden = meeting.participants.length - shown.length;

  return (
    <Link href={`/meetings/${meeting.id}`} className="flex flex-col gap-2 px-4 py-3 hover:bg-muted/50 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2 font-medium">
          {meeting.confidential && <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label={t("fields.confidential")} />}
          <span className="truncate">{meeting.title}</span>
          {meeting.callOpen && (
            <Badge variant="destructive" className="shrink-0">
              <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden />{t("overview.callRunning")}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {meeting.startsAt ? format.dateTime(meeting.startsAt, { dateStyle: "medium", timeStyle: "short" }) : t("noDate")}
          {meeting.projectName ? ` · ${meeting.projectName}` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {shown.length > 0 && (
            <span className="inline-flex min-w-0 items-center gap-1" title={meeting.participants.join(", ")}>
              <Users className="size-3.5 shrink-0" aria-label={t("overview.participants")} />
              <span className="truncate">{shown.join(", ")}{hidden > 0 ? ` ${t("overview.moreParticipants", { count: hidden })}` : ""}</span>
            </span>
          )}
          <span className="inline-flex items-center gap-1"><Mic className="size-3.5" aria-hidden />{t("overview.recordings", { count: meeting.recordingCount })}</span>
          {meeting.openActionItems > 0 && (
            <span className="inline-flex items-center gap-1 text-foreground"><ListTodo className="size-3.5" aria-hidden />{t("overview.openActionItems", { count: meeting.openActionItems })}</span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:justify-end">
        <Badge variant="outline">
          {meeting.protocolState === "approved" ? <CheckCircle2 /> : <FileText />}
          {t(`overview.protocol.${meeting.protocolState}`)}
        </Badge>
        <Badge variant={meeting.status === "review" ? "default" : "secondary"}>{t(`status.${meeting.status}`)}</Badge>
      </div>
    </Link>
  );
}
