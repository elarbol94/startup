import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { CallRoom } from "@/modules/meetings/components/call-room";
import { getMeetingDetail } from "@/modules/meetings/queries";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

export default async function MeetingCallPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const viewer = await requireUser();
  const { meetingId } = await params;
  const detail = getMeetingDetail(viewer, meetingId);
  if (!detail) notFound();
  const open = detail.calls.open;
  if (!detail.calls.enabled || !open) {
    const t = await getTranslations("meetings");
    return (
      <div className="mx-auto max-w-lg space-y-3 rounded-xl border p-5 text-sm">
        <p>{detail.calls.enabled ? t("call.notRunning") : t("errors.callsDisabled")}</p>
        <Link href={`/meetings/${meetingId}`} className="underline">{detail.meeting.title}</Link>
      </div>
    );
  }
  return <CallRoom meetingId={meetingId} title={detail.meeting.title} record={open.record} usesAi={detail.meeting.aiPolicy === "openai"} />;
}
