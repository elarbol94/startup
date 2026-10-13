import "server-only";
import webpush, { WebPushError } from "web-push";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import type { Locale } from "@/i18n/config";
import { vapidConfig } from "./config";
import type { PushPayload } from "./messages";
import { pushDeliveries, pushPreferences, pushSubscriptions } from "./schema";

export type PushCategory = "activity" | "calendar" | "tasksDue";

/** Active users with at least one device subscribed who want this category. */
export function pushRecipients(category: PushCategory): string[] {
  const wanted = or(isNull(pushPreferences.userId), eq(pushPreferences[category], true));
  return db.selectDistinct({ id: pushSubscriptions.userId })
    .from(pushSubscriptions)
    .innerJoin(user, eq(pushSubscriptions.userId, user.id))
    .leftJoin(pushPreferences, eq(pushPreferences.userId, pushSubscriptions.userId))
    .where(and(isNull(user.removedAt), wanted))
    .all()
    .map((row) => row.id);
}

/** Records (user, key) once; true only for the caller that claimed it. */
export function claimPushDelivery(userId: string, key: string) {
  return db.insert(pushDeliveries).values({ userId, key }).onConflictDoNothing().run().changes > 0;
}

/**
 * Sends one notification to every device of a user, rendered in each device's language.
 * Subscriptions the push service reports as gone (404/410) are removed.
 */
export async function sendPushToUser(userId: string, build: (locale: Locale) => PushPayload) {
  const config = vapidConfig();
  if (!config) return 0;
  const devices = db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)).all();
  const gone: string[] = [];
  let sent = 0;
  await Promise.all(devices.map(async (device) => {
    try {
      await webpush.sendNotification(
        { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
        JSON.stringify(build(device.locale)),
        { TTL: 60 * 60, urgency: "high", vapidDetails: config },
      );
      sent += 1;
    } catch (error) {
      if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
        gone.push(device.id);
        return;
      }
      console.warn(JSON.stringify({
        event: "push_send_failed",
        status: error instanceof WebPushError ? error.statusCode : undefined,
        reason: error instanceof Error ? error.message : String(error),
      }));
    }
  }));
  if (gone.length) db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone)).run();
  return sent;
}
