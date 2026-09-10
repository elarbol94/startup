"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getUserIdentities } from "@/modules/settings/identity-actions";
import { getUserMarkColor, identityVariable, initialsForName, userIdentityColor } from "@/lib/user-mark-colors";
import { cn } from "@/lib/utils";

type Identity = { id: string; markColor: string };
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
      if (detail) setLatest(rows => [...rows.filter(row => row.id !== detail.id), detail]);
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

export function UserIdentity({ userId, name, avatarOnly = false, className }: {
  userId?: string | null; name: string; avatarOnly?: boolean; className?: string;
}) {
  const currentUser = useContext(CurrentUser);
  const id = userId === undefined ? currentUser : userId;
  return <span className={cn("inline-flex min-w-0 items-center gap-1.5 align-middle", className)} title={name}>
    <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold text-white"
      style={{ backgroundColor: userIdentityColor(id) }}>{initialsForName(name)}</span>
    {avatarOnly ? <span className="sr-only">{name}</span> : <span className="truncate">{name}</span>}
  </span>;
}
