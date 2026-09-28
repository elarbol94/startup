"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { CalendarCheck, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { markNetworkContactContacted } from "../contact-actions";
import type { NetworkReconnectItem } from "../reconnect-queries";
import { dateOnly } from "./network-ui";
import { useNetworkAction } from "./use-network-action";

/** How overdue a reconnect is: "No contact yet", "Due today" or "Due since …". */
export function useReconnectDueLabel(today: string) {
  const t = useTranslations("network.reconnect");
  const format = useFormatter();
  return (item: Pick<NetworkReconnectItem, "dueOn">) => {
    if (!item.dueOn) return t("neverContacted");
    if (item.dueOn === today) return t("dueToday");
    return t("dueSince", { date: format.dateTime(dateOnly(item.dueOn), { dateStyle: "medium", timeZone: "UTC" }) });
  };
}

/** "Reconnect": the viewer's own contacts whose keep-in-touch cadence has run out. */
export function ReconnectList({ contacts, today }: { contacts: NetworkReconnectItem[]; today: string }) {
  const t = useTranslations("network");
  const format = useFormatter();
  const dueLabel = useReconnectDueLabel(today);
  const { pending, run } = useNetworkAction();
  if (!contacts.length) return null;

  return (
    <section className="space-y-2" aria-labelledby="network-reconnect-title" data-testid="network-reconnect">
      <div>
        <h2 id="network-reconnect-title" className="font-medium">{t("reconnect.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("reconnect.intro")}</p>
      </div>
      <ul className="divide-y rounded-2xl border bg-card">
        {contacts.map((contact) => (
          <li key={contact.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <Link href={`/network/${contact.id}`} className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline">
                {contact.visibility === "private" && <Lock className="size-3.5 text-muted-foreground" />}
                {contact.name}
              </Link>
              {contact.organization && <span className="text-sm text-muted-foreground"> · {contact.organization}</span>}
              <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{dueLabel(contact)}</span>
                <span>{t("reconnect.every", { days: contact.reconnectEveryDays })}</span>
                {contact.lastContactOn && (
                  <span>{t("reconnect.lastContact", { date: format.dateTime(dateOnly(contact.lastContactOn), { dateStyle: "medium", timeZone: "UTC" }) })}</span>
                )}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 self-start sm:self-center"
              disabled={pending}
              aria-label={t("reconnect.markContactedFor", { name: contact.name })}
              onClick={() => run(() => markNetworkContactContacted(contact.id), () => toast.success(t("contact.contactedToday")))}
            >
              <CalendarCheck className="size-4" />
              {t("contact.markContacted")}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
