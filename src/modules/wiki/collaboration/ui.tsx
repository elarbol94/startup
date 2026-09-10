"use client";
import { createContext, useContext, useEffect, useReducer, useState } from "react";
import { useTranslations } from "next-intl";
import { CollaborationProvider } from "./provider";
import type { Kind } from "./codec";
export const CollaborationContext = createContext<CollaborationProvider | null>(null);
export const useCollaborationContext = () => useContext(CollaborationContext);
export function useCollaboration(kind: Kind, id: string, enabled = true) {
  const [provider] = useState(() => new CollaborationProvider(kind, id));
  const [, refresh] = useReducer(value => value + 1, 0);
  useEffect(() => {
    if (!enabled) return;
    const unsubscribe = provider.subscribe(refresh);
    void provider.start();
    return () => { unsubscribe(); provider.stop(); };
  }, [provider, enabled]);
  return provider;
}
export function CollaborationStatus({ provider }: { provider: CollaborationProvider }) {
  const t = useTranslations("collaboration");
  return <div className="flex flex-wrap items-center gap-2 text-xs" role="status" data-testid="collaboration-status">
    <span>{t(provider.status)}</span>
    {[...new Map(provider.people.map(person => [person.userId, person])).values()].map(person => <span className="rounded-full bg-indigo-100 px-2 py-1 text-indigo-950" key={person.userId}>{person.name}{person.selectedIds?.length ? ` · ${t("selected", { count: person.selectedIds.length })}` : ""}</span>)}
    {!provider.recoveryAvailable && <span className="text-amber-700">{t("recoveryUnavailable")}</span>}
  </div>;
}
