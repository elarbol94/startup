import type { MeetingAccessRole, MeetingStatus } from "../../constants";

export const meetingListFilters = ["all", "review", "call", "host"] as const;
export type MeetingListFilter = (typeof meetingListFilters)[number];

/** The fields of a list row the filters look at. */
export type FilterableMeeting = {
  status: MeetingStatus;
  role: MeetingAccessRole;
  callOpen: boolean;
  protocolState: "none" | "draft" | "approved";
};

/** "Needs review": a protocol draft waits for approval. */
export const needsReview = (meeting: FilterableMeeting) => meeting.status === "review" || meeting.protocolState === "draft";

export function matchesFilter(meeting: FilterableMeeting, filter: MeetingListFilter) {
  switch (filter) {
    case "review": return needsReview(meeting);
    case "call": return meeting.callOpen;
    case "host": return meeting.role === "host";
    default: return true;
  }
}
