"use client";

import { useFormatter, useTranslations } from "next-intl";
import { CircleDot, Video } from "lucide-react";
import type { MeetingDetail } from "../../queries";

/**
 * The running call: who started it and who has joined since. Joining is
 * recorded when a token is issued; leaving is not, so this says "joined"
 * rather than claiming who is in the call right now.
 */
export function CallStatus({ detail }: { detail: MeetingDetail }) {
  const t = useTranslations("meetings");
  const format = useFormatter();
  const call = detail.calls.open;
  if (!call) return null;
  const time = (date: Date) => format.dateTime(date, { timeStyle: "short" });
  const starter = detail.members.find((member) => member.userId === call.startedBy)?.name
    ?? call.joined.find((entry) => entry.userId === call.startedBy)?.name ?? t("detailUi.unknownPerson");

  return (
    <section className="space-y-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm" aria-label={call.record ? t("call.runningRecorded") : t("call.running")}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {call.record ? <CircleDot className="size-4 text-red-600" aria-hidden /> : <Video className="size-4 text-red-600" aria-hidden />}
        <span className="font-medium">{call.record ? t("call.runningRecorded") : t("call.running")}</span>
        <span className="text-muted-foreground">{t("detailUi.callStarted", { time: time(call.startedAt), name: starter })}</span>
      </p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-muted-foreground" title={t("detailUi.callJoinedHint")}>{t("detailUi.callJoined")}:</span>
        {call.joined.length === 0 ? <span className="text-muted-foreground">{t("detailUi.callNobodyJoined")}</span> : (
          <ul className="flex flex-wrap gap-1.5">
            {call.joined.map((entry) => (
              <li key={entry.userId} className="rounded-full border bg-background px-2 py-0.5 text-xs">
                {entry.name} <span className="text-muted-foreground">· {t("detailUi.callJoinedAt", { time: time(entry.joinedAt) })}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
