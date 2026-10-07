import { requireUser } from "@/lib/auth";
import { MeetingsList } from "@/modules/meetings/components/meetings-list";
import { listMeetingFormOptions, listMeetings, searchMeetings } from "@/modules/meetings/queries";

export default async function MeetingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireUser();
  const raw = (await searchParams).q;
  const query = (Array.isArray(raw) ? raw[0] : raw ?? "").slice(0, 200);
  return (
    <MeetingsList
      meetings={listMeetings(viewer)}
      hits={query ? searchMeetings(viewer, query) : []}
      query={query}
      options={listMeetingFormOptions()}
      viewerId={viewer.id}
    />
  );
}
