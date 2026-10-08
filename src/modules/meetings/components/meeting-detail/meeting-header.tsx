"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Lock, MoreHorizontal, Settings, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { MeetingDetail } from "../../queries";
import { CallControls } from "../call-controls";

/** Title and facts on the left; actions on the right, wrapping below the title on narrow screens. */
export function MeetingHeader({ detail, viewerId, pending, onSettings, onDelete }: {
  detail: MeetingDetail;
  viewerId: string;
  pending: boolean;
  onSettings: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("meetings");
  const format = useFormatter();
  const meeting = detail.meeting;
  const call = detail.calls.open;

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1 basis-80 space-y-1.5">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          {meeting.confidential && <Lock className="size-4 shrink-0 text-muted-foreground" aria-label={t("fields.confidential")} />}
          <span className="min-w-0 break-words">{meeting.title}</span>
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{meeting.startsAt ? format.dateTime(meeting.startsAt, { dateStyle: "full", timeStyle: "short" }) : t("noDate")}</span>
          <Badge variant="secondary">{t(`status.${meeting.status}`)}</Badge>
          <Badge variant="outline"><Sparkles />{meeting.aiPolicy === "openai" ? t("ai.on") : t("ai.off")}</Badge>
          {call && (
            <Badge variant="destructive">
              <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden />
              {call.record ? t("call.runningRecorded") : t("call.running")}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{detail.members.map((member) => member.name).join(", ")}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <CallControls detail={detail} viewerId={viewerId} />
        {detail.role === "host" && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="icon-sm" aria-label={t("detailUi.more")} title={t("detailUi.more")} />}>
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={onSettings}><Settings />{t("settings.open")}</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" disabled={pending} onClick={onDelete}><Trash2 />{t("delete.button")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
