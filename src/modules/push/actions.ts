"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { db } from "@/db";
import { locales, type Locale } from "@/i18n/config";
import { requireUserOrThrow } from "@/lib/auth";
import { isPushServiceEndpoint } from "./endpoint";
import { testPayload } from "./messages";
import { pushPreferences, pushSubscriptions } from "./schema";
import { sendPushToUser } from "./send";

const key = z.string().min(1).max(256).regex(/^[A-Za-z0-9_=-]+$/);
const endpointSchema = z.string().max(2048).refine(isPushServiceEndpoint);
const subscriptionSchema = z.object({ endpoint: endpointSchema, keys: z.object({ p256dh: key, auth: key }) });
const preferencesSchema = z.object({ activity: z.boolean(), calendar: z.boolean(), tasksDue: z.boolean() });

/** Stores (or re-binds) this device's subscription; also refreshes its language. */
export async function savePushSubscription(input: z.input<typeof subscriptionSchema>) {
  const currentUser = await requireUserOrThrow();
  const { endpoint, keys } = subscriptionSchema.parse(input);
  const requestLocale = await getLocale();
  const locale: Locale = locales.includes(requestLocale as Locale) ? requestLocale as Locale : "de";
  const userAgent = ((await headers()).get("user-agent") ?? "").slice(0, 300);
  const values = { userId: currentUser.id, p256dh: keys.p256dh, auth: keys.auth, locale, userAgent, updatedAt: new Date() };
  db.insert(pushSubscriptions).values({ endpoint, ...values })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values }).run();
}

export async function removePushSubscription(endpoint: string) {
  const currentUser = await requireUserOrThrow();
  const parsed = z.string().max(2048).parse(endpoint);
  db.delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, currentUser.id), eq(pushSubscriptions.endpoint, parsed))).run();
}

export async function updatePushPreferences(input: z.input<typeof preferencesSchema>) {
  const currentUser = await requireUserOrThrow();
  const values = preferencesSchema.parse(input);
  db.insert(pushPreferences).values({ userId: currentUser.id, ...values })
    .onConflictDoUpdate({ target: pushPreferences.userId, set: values }).run();
  revalidatePath("/settings/profile");
}

/** Sends a test notification to all of the current user's devices; returns how many accepted it. */
export async function sendTestPush() {
  const currentUser = await requireUserOrThrow();
  return sendPushToUser(currentUser.id, testPayload);
}
