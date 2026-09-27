"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { linkNetworkContact, searchNetworkLinkTargets, unlinkNetworkContact } from "../link-actions";
import type { NetworkContactLink, NetworkLinkTarget } from "../link-queries";
import { LinkTargetIcon } from "./link-target-icon";
import { useNetworkAction } from "./use-network-action";

/** Projects, funding projects and wiki pages this contact is involved in. */
export function ContactLinks({ contactId, links, canEdit }: { contactId: string; links: NetworkContactLink[]; canEdit: boolean }) {
  const t = useTranslations("network");
  const { pending, run } = useNetworkAction();
  const [picking, setPicking] = useState(false);

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium">{t("links.title")}</h3>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setPicking(true)}>
            <Link2 className="size-4" />
            {t("links.add")}
          </Button>
        )}
      </div>
      {links.length ? (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card" data-testid="network-contact-links">
          {links.map((link) => (
            <li key={link.linkId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <LinkTargetIcon type={link.type} className="size-4 shrink-0 text-muted-foreground" />
              <Link href={link.href} className="min-w-0 flex-1 truncate hover:underline">
                {link.title}
                <span className="text-muted-foreground"> · {t(`links.types.${link.type}`)}{link.subtitle ? ` · ${link.subtitle}` : ""}</span>
              </Link>
              {canEdit && (
                <Button size="icon-xs" variant="ghost" aria-label={t("links.remove", { title: link.title })} disabled={pending} onClick={() => run(() => unlinkNetworkContact(link.linkId))}>
                  <Unlink />
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("links.empty")}</p>
      )}
      <Dialog open={picking} onOpenChange={setPicking}>
        {picking && (
          <LinkPicker
            linked={new Set(links.map((link) => `${link.type}:${link.id}`))}
            onPick={(target) => run(() => linkNetworkContact({ contactId, targetType: target.type, targetId: target.id }), () => setPicking(false))}
            pending={pending}
          />
        )}
      </Dialog>
    </section>
  );
}

function LinkPicker({ linked, onPick, pending }: { linked: Set<string>; onPick: (target: NetworkLinkTarget) => void; pending: boolean }) {
  const t = useTranslations("network");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ query: string; targets: NetworkLinkTarget[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void searchNetworkLinkTargets(query).then((targets) => {
        if (!cancelled) setResults({ query, targets });
      }).catch(() => {
        if (!cancelled) setResults({ query, targets: [] });
      });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const targets = results?.targets.filter((target) => !linked.has(`${target.type}:${target.id}`)) ?? [];
  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{t("links.pickTitle")}</DialogTitle>
        <DialogDescription>{t("links.pickDescription")}</DialogDescription>
      </DialogHeader>
      <Input autoFocus type="search" aria-label={t("links.search")} placeholder={t("links.search")} value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="max-h-80 min-h-24 overflow-y-auto" data-testid="network-link-results">
        {results === null ? (
          <p className="p-3 text-sm text-muted-foreground">{t("links.searching")}</p>
        ) : targets.length ? (
          <ul>
            {targets.map((target) => (
              <li key={`${target.type}:${target.id}`}>
                <button
                  type="button"
                  disabled={pending}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
                  onClick={() => onPick(target)}
                >
                  <LinkTargetIcon type={target.type} className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{target.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {t(`links.types.${target.type}`)}{target.subtitle ? ` · ${target.subtitle}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-3 text-sm text-muted-foreground">{t("links.noResults")}</p>
        )}
      </div>
    </DialogContent>
  );
}
