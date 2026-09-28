"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { interactionChannels, type InteractionChannel } from "../constants";
import { updateNetworkInteraction } from "../interaction-actions";
import type { NetworkContactDetail } from "../queries";
import { selectClassName } from "./network-ui";
import { useNetworkAction } from "./use-network-action";

type Interaction = NetworkContactDetail["interactions"][number];

/** Inline form that corrects a logged touchpoint's date, channel or note. */
export function InteractionEditForm({
  interaction,
  today,
  onDone,
}: {
  interaction: Interaction;
  today: string;
  onDone: () => void;
}) {
  const t = useTranslations("network");
  const { pending, run } = useNetworkAction();
  const [form, setForm] = useState({
    occurredOn: interaction.occurredOn,
    channel: interaction.channel,
    note: interaction.note,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    run(() => updateNetworkInteraction({ id: interaction.id, ...form }), onDone);
  }

  return (
    <form
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === "Escape") onDone();
      }}
      aria-label={t("interactionEdit.title")}
      className="grid w-full gap-2 sm:grid-cols-[9.5rem_11rem_minmax(0,1fr)_auto]"
    >
      <Input
        type="date"
        required
        autoFocus
        aria-label={t("history.date")}
        max={today > interaction.occurredOn ? today : interaction.occurredOn}
        value={form.occurredOn}
        onChange={(event) => setForm({ ...form, occurredOn: event.target.value })}
      />
      <select
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
      <div className="flex items-center gap-1">
        <Button type="submit" size="icon-xs" variant="outline" aria-label={t("interactionEdit.save")} disabled={pending || !form.occurredOn}>
          <Check />
        </Button>
        <Button type="button" size="icon-xs" variant="ghost" aria-label={t("interactionEdit.cancel")} disabled={pending} onClick={onDone}>
          <X />
        </Button>
      </div>
    </form>
  );
}
