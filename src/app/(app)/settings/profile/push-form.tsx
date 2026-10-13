"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { BellOff, BellRing, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SettingsCard } from "../settings-card";
import { removePushSubscription, savePushSubscription, sendTestPush, updatePushPreferences } from "@/modules/push/actions";
import type { PushPreferences } from "@/modules/push/queries";
import { browserPushSupport, currentSubscription, subscribeDevice, subscriptionInput } from "@/modules/push/components/push-client";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

const categories = ["activity", "calendar", "tasksDue"] as const;

/** Profile card: turn push on/off for this device and choose what the user is notified about. */
export function PushForm({ publicKey, preferences }: { publicKey: string | null; preferences: PushPreferences }) {
  const t = useTranslations("settings.push");
  // Browser capabilities are unknown during server rendering and hydration.
  const mounted = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [choices, setChoices] = useState(preferences);
  const [pending, startTransition] = useTransition();
  const support = !mounted ? null : permission === "denied" ? "denied" : browserPushSupport();

  useEffect(() => {
    if (!publicKey || support !== "available") return;
    let active = true;
    currentSubscription()
      .then((subscription) => { if (active) setSubscribed(Boolean(subscription)); })
      .catch(() => { if (active) setSubscribed(false); });
    return () => { active = false; };
  }, [publicKey, support]);

  function run(task: () => Promise<void>) {
    startTransition(async () => {
      try {
        await task();
      } catch {
        toast.error(t("failed"));
      }
    });
  }

  const enable = () => run(async () => {
    if (!publicKey) return;
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result !== "granted") return;
    const subscription = await subscribeDevice(publicKey);
    await savePushSubscription(subscriptionInput(subscription));
    setSubscribed(true);
  });

  const disable = () => run(async () => {
    const subscription = await currentSubscription();
    if (subscription) {
      await removePushSubscription(subscription.endpoint);
      await subscription.unsubscribe();
    }
    setSubscribed(false);
  });

  const test = () => run(async () => {
    const sent = await sendTestPush();
    if (sent) toast.success(t("testSent"));
    else toast.error(t("testFailed"));
  });

  const toggle = (key: (typeof categories)[number], value: boolean) => {
    const next = { ...choices, [key]: value };
    setChoices(next);
    run(() => updatePushPreferences(next));
  };

  const status = !publicKey ? t("notConfigured")
    : support === "unsupported" ? t("unsupported")
    : support === "denied" ? t("denied")
    : subscribed ? t("enabled")
    : subscribed === false ? t("disabledState")
    : null;

  return (
    <SettingsCard
      title={t("title")}
      description={t("description")}
      descriptionId="push-description"
      actions={publicKey && support === "available" && subscribed !== null ? (
        subscribed ? (
          <>
            <Button variant="outline" size="sm" onClick={test} disabled={pending}><Send />{t("test")}</Button>
            <Button variant="outline" size="sm" onClick={disable} disabled={pending}><BellOff />{t("disable")}</Button>
          </>
        ) : (
          <Button size="sm" onClick={enable} disabled={pending}><BellRing />{t("enable")}</Button>
        )
      ) : null}
    >
      {status ? <p className="mb-3 text-[13px] text-muted-foreground" aria-live="polite">{status}</p> : null}
      <fieldset aria-describedby="push-description" disabled={!publicKey}>
        <legend className="mb-2 text-[13px] font-medium">{t("categories")}</legend>
        <div className="flex flex-col gap-2.5">
          {categories.map((key) => (
            <label key={key} className="flex items-center gap-2.5 text-[13.5px]">
              <Checkbox checked={choices[key]} onCheckedChange={(value) => toggle(key, value)} disabled={!publicKey} />
              {t(key)}
            </label>
          ))}
        </div>
      </fieldset>
    </SettingsCard>
  );
}
