"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowLeft, Lock, Settings, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { deleteMeeting } from "../meeting-actions";
import type { MeetingDetail as Detail } from "../queries";
import { ProtocolPanel } from "./meeting-detail/protocol-panel";
import { RecordingsPanel } from "./meeting-detail/recordings-panel";
import { SettingsDialog } from "./meeting-detail/settings-dialog";
import { TranscriptPanel } from "./meeting-detail/transcript-panel";
import { useMeetingAction } from "./meeting-ui";
import type { MeetingFormOptions } from "./new-meeting-dialog";

export function MeetingDetail({ detail, options }: { detail: Detail; options: MeetingFormOptions }) {
  const t = useTranslations("meetings");
  const format = useFormatter();
  const router = useRouter();
  const { pending, run } = useMeetingAction();
  const [confirmElement, confirm] = useConfirm();
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Chosen once: a protocol arriving through a refresh must not switch the tab away.
  const [tab, setTab] = useState(() => detail.currentProtocol ? "protocol" : "recordings");
  const meeting = detail.meeting;
  const working = meeting.status === "processing" || detail.uploads.some((upload) => upload.state !== "aborted")
    || detail.jobs.some((job) => job.status === "queued" || job.status === "running");

  // While the worker processes recordings, refresh so results appear without a reload.
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => router.refresh(), 5_000);
    return () => clearInterval(timer);
  }, [working, router]);

  async function remove() {
    if (!await confirm({ title: t("delete.title"), description: t("delete.description"), confirmLabel: t("delete.confirm"), destructive: true })) return;
    run(() => deleteMeeting(meeting.id), () => router.push("/meetings"));
  }

  return (
    <div className="space-y-4">
      {confirmElement}
      <Link href="/meetings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />{t("back")}</Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            {meeting.confidential && <Lock className="size-4 text-muted-foreground" aria-label={t("fields.confidential")} />}
            {meeting.title}
          </h2>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {meeting.startsAt ? format.dateTime(meeting.startsAt, { dateStyle: "full", timeStyle: "short" }) : t("noDate")}
            <Badge variant="secondary">{t(`status.${meeting.status}`)}</Badge>
            <Badge variant="outline"><Sparkles />{meeting.aiPolicy === "openai" ? t("ai.on") : t("ai.off")}</Badge>
          </p>
          <p className="text-sm text-muted-foreground">{detail.members.map((member) => member.name).join(", ")}</p>
        </div>
        {detail.role === "host" && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}><Settings />{t("settings.open")}</Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => void remove()}><Trash2 />{t("delete.button")}</Button>
          </div>
        )}
      </div>
      {meeting.agenda && <p className="rounded-xl border bg-muted/30 p-3 text-sm whitespace-pre-wrap">{meeting.agenda}</p>}
      <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
        <TabsList>
          <TabsTrigger value="protocol">{t("tabs.protocol")}</TabsTrigger>
          <TabsTrigger value="transcript">{t("tabs.transcript")}</TabsTrigger>
          <TabsTrigger value="recordings">{t("tabs.recordings")}</TabsTrigger>
        </TabsList>
        <TabsContent value="protocol" className="pt-4"><ProtocolPanel detail={detail} options={options} /></TabsContent>
        <TabsContent value="transcript" className="pt-4"><TranscriptPanel detail={detail} /></TabsContent>
        <TabsContent value="recordings" className="pt-4"><RecordingsPanel detail={detail} /></TabsContent>
      </Tabs>
      {detail.role === "host" && <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} detail={detail} options={options} />}
    </div>
  );
}
