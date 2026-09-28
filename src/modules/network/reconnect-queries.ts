import "server-only";

import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { localDateInZone } from "@/modules/calendar/date-utils";
import { TIME_ZONE } from "@/modules/time/lib/entry-time";
import type { NetworkViewer } from "./access";
import { compareContacts } from "./contact-filters";
import { listNetworkFollowUps } from "./queries";
import { isReconnectDue, reconnectDueOn } from "./reconnect-utils";
import { networkContacts } from "./schema";

export type NetworkReconnectItem = {
  id: string;
  name: string;
  organization: string;
  visibility: "private" | "team";
  lastContactOn: string | null;
  reconnectEveryDays: number;
  /** YYYY-MM-DD, or "" when there has been no contact yet. */
  dueOn: string;
};

/**
 * People to get back in touch with: the viewer's own contacts (private or
 * shared) whose cadence has run out. Unlike follow-ups, leads the viewer
 * captured on someone else's team contact do not count: keeping in touch is
 * the owner's habit. Never contacted first, then the oldest due date, then name.
 */
export function listReconnectDue(
  viewer: NetworkViewer,
  options: { limit?: number; today?: string } = {},
) {
  const today = options.today ?? localDateInZone(new Date(), TIME_ZONE);
  const due = db
    .select({
      id: networkContacts.id,
      name: networkContacts.name,
      organization: networkContacts.organization,
      visibility: networkContacts.visibility,
      lastContactOn: networkContacts.lastContactOn,
      reconnectEveryDays: networkContacts.reconnectEveryDays,
      createdAt: networkContacts.createdAt,
    })
    .from(networkContacts)
    .where(and(eq(networkContacts.ownerId, viewer.id), isNotNull(networkContacts.reconnectEveryDays)))
    .all()
    .filter((contact) => isReconnectDue(contact, today))
    .sort(compareContacts("reconnect"))
    .map((contact): NetworkReconnectItem => ({
      id: contact.id,
      name: contact.name,
      organization: contact.organization,
      visibility: contact.visibility,
      lastContactOn: contact.lastContactOn,
      reconnectEveryDays: contact.reconnectEveryDays ?? 0,
      dueOn: reconnectDueOn(contact.lastContactOn, contact.reconnectEveryDays) ?? "",
    }));
  const limit = options.limit;
  return { contacts: limit === undefined ? due : due.slice(0, limit), total: due.length };
}

/** Dashboard: open follow-ups first, then people to reconnect with, `limit` rows in all. */
export function listNetworkOverview(viewer: NetworkViewer, options: { limit?: number; today?: string } = {}) {
  const limit = options.limit ?? 8;
  const followUps = listNetworkFollowUps(viewer, limit);
  const reconnects = listReconnectDue(viewer, { limit: Math.max(0, limit - followUps.leads.length), today: options.today });
  return { leads: followUps.leads, reconnects: reconnects.contacts, total: followUps.total + reconnects.total };
}
