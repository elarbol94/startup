import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { MeetingDetail } from "@/modules/meetings/components/meeting-detail";
import { getMeetingDetail, listMeetingFormOptions } from "@/modules/meetings/queries";

export default async function MeetingPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const viewer = await requireUser();
  const { meetingId } = await params;
  // Meetings the viewer is not on the access list of answer 404, like missing ones.
  const detail = getMeetingDetail(viewer, meetingId);
  if (!detail) notFound();
  return <MeetingDetail detail={detail} options={listMeetingFormOptions()} viewerId={viewer.id} />;
}
