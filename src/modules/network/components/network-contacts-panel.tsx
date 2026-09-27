"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Handshake, Lock, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ContactLinkTargetType } from "../constants";
import { linkNetworkContact, unlinkNetworkContact } from "../link-actions";
import type { LinkedNetworkContact } from "../link-queries";
import type { NetworkContactOption } from "../queries";
import { selectClassName } from "./network-ui";
import { useNetworkAction } from "./use-network-action";

/**
 * "Contacts from the network" on a project or funding project. Each viewer
 * only sees contacts visible to them, so private contacts stay private here too.
 */
export function NetworkContactsPanel({
  targetType,
  targetId,
  contacts,
  options,
}: {
  targetType: ContactLinkTargetType;
  targetId: string;
  contacts: LinkedNetworkContact[];
  options: NetworkContactOption[];
}) {
  const t = useTranslations("network");
  const { pending, run } = useNetworkAction();
  const [selected, setSelected] = useState("");
  const linked = new Set(contacts.map((contact) => contact.contactId));
  const available = options.filter((option) => !linked.has(option.id));

  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4" data-testid="network-contacts-panel">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Handshake className="size-4 text-muted-foreground" />
        {t("links.panelTitle")}
      </h2>
      {contacts.length ? (
        <ul className="space-y-1">
          {contacts.map((contact) => (
            <li key={contact.linkId} className="flex items-center gap-2 text-sm">
              <Link href={`/network/${contact.contactId}`} className="min-w-0 flex-1 truncate hover:underline">
                <span className="font-medium">{contact.name}</span>
                {contact.visibility === "private" && <Lock className="ml-1 inline size-3 text-muted-foreground" aria-label={t("visibility.private")} />}
                {(contact.role || contact.organization) && (
                  <span className="text-muted-foreground"> · {[contact.role, contact.organization].filter(Boolean).join(", ")}</span>
                )}
                {contact.activeLeads > 0 && (
                  <span className="text-muted-foreground"> · {t("links.openLeads", { count: contact.activeLeads })}</span>
                )}
              </Link>
              <Button size="icon-xs" variant="ghost" aria-label={t("links.remove", { title: contact.name })} disabled={pending} onClick={() => run(() => unlinkNetworkContact(contact.linkId))}>
                <Unlink />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t("links.panelEmpty")}</p>
      )}
      {available.length > 0 && (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!selected) return;
            run(() => linkNetworkContact({ contactId: selected, targetType, targetId }), () => setSelected(""));
          }}
        >
          <select aria-label={t("links.chooseContact")} className={selectClassName} value={selected} onChange={(event) => setSelected(event.target.value)}>
            <option value="">{t("links.chooseContact")}</option>
            {available.map((option) => (
              <option key={option.id} value={option.id}>{option.organization ? `${option.name} · ${option.organization}` : option.name}</option>
            ))}
          </select>
          <Button type="submit" size="sm" variant="outline" className="h-8" disabled={pending || !selected}>{t("links.add")}</Button>
        </form>
      )}
    </section>
  );
}
