"use client";
import { UserIdentity } from "@/components/user-identity";
import { cn } from "@/lib/utils";
import { createContext, useContext, useEffect, useReducer, useState } from "react";
import { useTranslations } from "next-intl";
import { CollaborationProvider, type CollaborationClient } from "./provider";
import { SocketCollaborationProvider } from "./socket-provider";
import type { Kind } from "./codec";
export const CollaborationContext = createContext<CollaborationClient | null>(null);
export const useCollaborationContext = () => useContext(CollaborationContext);
export function useCollaboration(kind: Kind, id: string, enabled = true) {
  // Wiki pages use the WebSocket server; presentations keep the HTTP transport.
  const [provider] = useState<CollaborationClient>(() => kind === "page" ? new SocketCollaborationProvider(kind, id) : new CollaborationProvider(kind, id));
  const [, refresh] = useReducer(value => value + 1, 0);
  useEffect(() => {
    if (!enabled) return;
    const unsubscribe = provider.subscribe(refresh);
    void provider.start();
    return () => { unsubscribe(); provider.stop(); };
  }, [provider, enabled]);
  return provider;
}
const ERROR_REASONS = new Set(["tooLarge", "invalid"]);
/** `className` lets an editor that shows its own save state keep this one for assistive tech only (e.g. "sr-only"). */
export function CollaborationStatus({ provider, className }: { provider: CollaborationClient; className?: string }) {
  const t = useTranslations("collaboration");
  const reason = provider.status === "error" && provider.errorReason && ERROR_REASONS.has(provider.errorReason) ? provider.errorReason : null;
  return <div className={cn("flex flex-wrap items-center gap-2 text-xs", className)} role="status" data-testid="collaboration-status">
    <span className={reason ? "text-destructive" : undefined}>{reason ? t(`errorReasons.${reason}`) : t(provider.status)}</span>
    {[...new Map(provider.people.map(person => [person.userId, person])).values()].map(person => <span className="rounded-full border px-2 py-1" key={person.userId}><UserIdentity userId={person.userId} name={person.name} />{person.selectedIds?.length ? ` · ${t("selected", { count: person.selectedIds.length })}` : ""}</span>)}
    {!provider.recoveryAvailable && <span className="text-amber-700">{t("recoveryUnavailable")}</span>}
  </div>;
}
