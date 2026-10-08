"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { deleteMeeting } from "../meeting-actions";
import type { MeetingDetail as Detail } from "../queries";
import { ProtocolPanel } from "./meeting-detail/protocol-panel";
import { RecordingsPanel } from "./meeting-detail/recordings-panel";
import { SettingsDialog } from "./meeting-detail/settings-dialog";
import { TranscriptPanel } from "./meeting-detail/transcript-panel";
import { CallStatus } from "./meeting-detail/call-status";
import { MeetingHeader } from "./meeting-detail/meeting-header";
import { useMeetingAction } from "./meeting-ui";
import type { MeetingFormOptions } from "./new-meeting-dialog";

export function MeetingDetail({ detail, options, viewerId }: { detail: Detail; options: MeetingFormOptions; viewerId: string }) {
  const t = useTranslations("meetings");
  const router = useRouter();
  const { pending, run } = useMeetingAction();
  const [confirmElement, confirm] = useConfirm();
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Chosen once: a protocol arriving through a refresh must not switch the tab away.
  const [tab, setTab] = useState(() => detail.currentProtocol ? "protocol" : "recordings");
  const meeting = detail.meeting;
  const working = meeting.status === "processing" || detail.uploads.some((upload) => upload.state !== "aborted")
    || detail.jobs.some((job) => job.status === "queued" || job.status === "running");

  // While recordings are processed or a call runs, refresh so results and the
  // end of the call appear without a reload.
  const callOpen = Boolean(detail.calls.open);
  useEffect(() => {
    if (!working && !callOpen) return;
    const timer = setInterval(() => router.refresh(), working ? 5_000 : 15_000);
    return () => clearInterval(timer);
  }, [working, callOpen, router]);

  async function remove() {
    if (!await confirm({ title: t("delete.title"), description: t("delete.description"), confirmLabel: t("delete.confirm"), destructive: true })) return;
    run(() => deleteMeeting(meeting.id), () => router.push("/meetings"));
  }

  return (
    <div className="space-y-4">
      {confirmElement}
      <Link href="/meetings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />{t("back")}</Link>
      <MeetingHeader detail={detail} viewerId={viewerId} pending={pending} onSettings={() => setSettingsOpen(true)} onDelete={() => void remove()} />
      <CallStatus detail={detail} />
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
