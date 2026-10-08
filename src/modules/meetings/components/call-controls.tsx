"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { PhoneOff, Video } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { endCall, startCall } from "../call-actions";
import type { MeetingDetail } from "../queries";
import { useMeetingAction } from "./meeting-ui";

/** Start, join or end the meeting's online call. */
export function CallControls({ detail, viewerId }: { detail: MeetingDetail; viewerId: string }) {
  const t = useTranslations("meetings");
  const router = useRouter();
  const { pending, run } = useMeetingAction();
  const [starting, setStarting] = useState(false);
  const [record, setRecord] = useState(true);
  if (!detail.calls.enabled || detail.meeting.status === "cancelled") return null;
  const callUrl = `/meetings/${detail.meeting.id}/call`;
  const open = detail.calls.open;

  if (open) {
    const canEnd = detail.role === "host" || open.startedBy === viewerId;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Link href={callUrl} className={buttonVariants({ size: "sm" })}><Video />{t("call.join")}</Link>
        {canEnd && <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => endCall(detail.meeting.id))}><PhoneOff />{t("call.end")}</Button>}
      </div>
    );
  }
  if (detail.role === "viewer") return null;
  return (
    <>
      <Button size="sm" onClick={() => setStarting(true)}><Video />{t("call.start")}</Button>
      <Dialog open={starting} onOpenChange={setStarting}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("call.startTitle")}</DialogTitle>
            <DialogDescription>{t("call.startDescription")}</DialogDescription>
          </DialogHeader>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox className="mt-0.5" checked={record} onCheckedChange={(checked) => setRecord(checked === true)} />
            <span>
              <span className="font-medium">{t("call.record")}</span>
              <span className="block text-xs text-muted-foreground">
                {detail.meeting.aiPolicy === "openai" ? t("call.recordHintAi") : t("call.recordHint")}
              </span>
            </span>
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStarting(false)}>{t("cancel")}</Button>
            <Button disabled={pending} onClick={() => run(() => startCall({ meetingId: detail.meeting.id, record }), () => {
              setStarting(false);
              router.push(callUrl);
            })}>{t("call.startButton")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
