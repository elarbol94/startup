"use client";

import { useId, useState, type FormEvent } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { interactionChannels, type InteractionChannel } from "../constants";
import { addNetworkInteraction, deleteNetworkInteraction } from "../interaction-actions";
import type { NetworkContactDetail } from "../queries";
import { dateOnly, selectClassName } from "./network-ui";
import { useNetworkAction } from "./use-network-action";

/** The contact's history of touchpoints; the latest one sets "last contact". */
export function InteractionLog({
  contactId,
  interactions,
  canEdit,
  today,
}: {
  contactId: string;
  interactions: NetworkContactDetail["interactions"];
  canEdit: boolean;
  today: string;
}) {
  const t = useTranslations("network");
  const format = useFormatter();
  const id = useId();
  const { pending, run } = useNetworkAction();
  const [form, setForm] = useState({ occurredOn: today, channel: "meeting" as InteractionChannel, note: "" });

  function submit(event: FormEvent) {
    event.preventDefault();
    run(() => addNetworkInteraction({ contactId, ...form }), () => setForm({ occurredOn: today, channel: "meeting", note: "" }));
  }

  return (
    <section className="space-y-2">
      <h3 className="font-medium">{t("history.title")}</h3>
      {canEdit && (
        <form onSubmit={submit} className="grid gap-2 rounded-2xl border bg-card p-3 sm:grid-cols-[9.5rem_11rem_minmax(0,1fr)_auto]">
          <Input
            type="date"
            required
            aria-label={t("history.date")}
            max={today}
            value={form.occurredOn}
            onChange={(event) => setForm({ ...form, occurredOn: event.target.value })}
          />
          <select
            id={`${id}-channel`}
            aria-label={t("history.channel")}
            className={selectClassName}
            value={form.channel}
            onChange={(event) => setForm({ ...form, channel: event.target.value as InteractionChannel })}
          >
            {interactionChannels.map((channel) => <option key={channel} value={channel}>{t(`channels.${channel}`)}</option>)}
          </select>
          <Input
            aria-label={t("history.note")}
            maxLength={1000}
            placeholder={t("history.notePlaceholder")}
            value={form.note}
            onChange={(event) => setForm({ ...form, note: event.target.value })}
          />
          <Button type="submit" size="sm" variant="outline" className="h-8" disabled={pending || !form.occurredOn}>
            <Plus className="size-4" />
            {t("history.add")}
          </Button>
        </form>
      )}
      {interactions.length ? (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card" data-testid="network-interactions">
          {interactions.map((interaction) => (
            <li key={interaction.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
              <span className="w-24 shrink-0 text-muted-foreground tabular-nums">
                {format.dateTime(dateOnly(interaction.occurredOn), { dateStyle: "medium", timeZone: "UTC" })}
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-muted-foreground">{t(`channels.${interaction.channel}`)}</span>
                {interaction.note && <span className="whitespace-pre-wrap">: {interaction.note}</span>}
              </span>
              {canEdit && (
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={t("history.delete")}
                  disabled={pending}
                  onClick={() => run(() => deleteNetworkInteraction(interaction.id))}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("history.empty")}</p>
      )}
    </section>
  );
}
