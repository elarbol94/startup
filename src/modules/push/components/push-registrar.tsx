"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { savePushSubscription } from "../actions";
import { browserPushSupport, currentSubscription, subscribeDevice, subscriptionInput } from "./push-client";

/**
 * Registers the service worker on every app load (needed to install the app) and, when
 * this device already receives push, re-binds it to the signed-in user and refreshes
 * its language and key. It never asks for permission; that happens in profile settings.
 */
export function PushRegistrar({ publicKey }: { publicKey: string | null }) {
  // Re-runs after a language switch so pushes follow the new language.
  const locale = useLocale();
  useEffect(() => {
    if (browserPushSupport() === "unsupported") return;
    (async () => {
      const existing = await currentSubscription();
      if (!existing || !publicKey || Notification.permission !== "granted") return;
      const subscription = await subscribeDevice(publicKey);
      await savePushSubscription(subscriptionInput(subscription));
    })().catch(() => {
      // Push upkeep must never disturb the app.
    });
  }, [publicKey, locale]);
  return null;
}
