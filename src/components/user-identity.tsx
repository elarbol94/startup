"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getUserIdentities } from "@/modules/settings/identity-actions";
import { getUserMarkColor, identityVariable, initialsForName, userIdentityColor } from "@/lib/user-mark-colors";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

type Identity = { id: string; markColor: string; name?: string };
const CurrentUser = createContext("");
const Identities = createContext<Identity[]>([]);
export function useIdentityColor(userId: string, fallback: string) {
  return useContext(Identities).find(person => person.id === userId)?.markColor ?? fallback;
}
export const IDENTITY_CHANGED = "user-identity-changed";

export function UserIdentityProvider({ currentUserId, identities, children }: {
  currentUserId: string; identities: Identity[]; children: React.ReactNode;
}) {
  const [latest, setLatest] = useState(identities);
  useEffect(() => {
    let disposed = false;
    let loading = false;
    let revision = 0;
    async function refresh() {
      if (document.visibilityState === "hidden" || loading) return;
      loading = true;
      const startedAt = revision;
      try {
        const next = await getUserIdentities();
        if (!disposed && startedAt === revision) setLatest(next);
      } catch { /* Keep the last confirmed identities while offline. */ }
      finally { loading = false; }
    }
    function changed(event: Event) {
      revision += 1;
      const detail = (event as CustomEvent<Identity>).detail;
      if (detail) setLatest(rows => [...rows.filter(row => row.id !== detail.id), { ...rows.find(row => row.id === detail.id), ...detail }]);
      void refresh();
    }
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener(IDENTITY_CHANGED, changed);
    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener(IDENTITY_CHANGED, changed);
    };
  }, []);
  const variables = latest.flatMap(person => {
    const color = getUserMarkColor(person.markColor);
    return (["solid", "highlight", "hover", "dark"] as const).map(variant =>
      `${identityVariable(person.id, variant)}:${color[variant]};`);
  }).join("");
  return <CurrentUser.Provider value={currentUserId}><Identities.Provider value={latest}><style>{`:root{${variables}}`}</style>{children}</Identities.Provider></CurrentUser.Provider>;
}

export function UserIdentity({ userId, name, avatarOnly = false, compact = false, className }: {
  userId?: string | null; name?: string | null; avatarOnly?: boolean; compact?: boolean; className?: string;
}) {
  const t = useTranslations("userIdentity");
  const currentUser = useContext(CurrentUser);
  const identities = useContext(Identities);
  const id = userId === undefined ? currentUser : userId;
  const identity = identities.find(person => person.id === id);
  const displayName = name || identity?.name || t(id ? "unknownUser" : "unassigned");
  return <span data-user-id={id || undefined} className={cn("inline-flex min-w-0 items-center gap-1.5 align-middle", className)} title={displayName}>
    <span aria-hidden="true" className={cn("grid shrink-0 place-items-center rounded-full font-semibold", compact ? "size-4 text-[8px]" : "size-6 text-[10px]", identity ? "text-white" : "bg-muted text-muted-foreground")}
      style={identity ? { backgroundColor: userIdentityColor(id) } : undefined}>{initialsForName(displayName)}</span>
    {avatarOnly ? <span className="sr-only">{displayName}</span> : <span className="truncate">{displayName}</span>}
  </span>;
}

export function UserIdentities({ userIds, compact = false, className }: { userIds: string[]; compact?: boolean; className?: string }) {
  return <span className={cn("inline-flex min-w-0 flex-wrap items-center gap-1.5", className)}>{[...new Set(userIds)].map(id => <UserIdentity key={id} userId={id} compact={compact} />)}</span>;
}

export function UserAttribution({ userId, relation, className }: { userId: string | null; relation: "createdBy" | "updatedBy" | "assignedTo" | "managedBy" | "uploadedBy"; className?: string }) {
  const t = useTranslations("userIdentity");
  if (!userId) return null;
  return <span className={cn("inline-flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground", className)}><span>{t(relation)}</span><UserIdentity userId={userId} compact /></span>;
}
