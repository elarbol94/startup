"use client";

import { useCallback, useEffect, useState } from "react";
import type { OfficeStatus } from "../../office/queries";

const POLL_MS = 15_000;

/**
 * Polls what the app has durably stored. "Synced to the editor" comes from
 * DocsAPI; this is the separate "stored by the app" state.
 */
export function useOfficeStatus(pageId: string, active: boolean) {
  const [status, setStatus] = useState<OfficeStatus | null>(null);
  const refresh = useCallback(async () => {
    const response = await fetch(`/api/wiki/office/${encodeURIComponent(pageId)}/status`, { cache: "no-store" }).catch(() => null);
    if (response?.ok) setStatus(await response.json() as OfficeStatus);
  }, [pageId]);
  useEffect(() => {
    if (!active) return;
    // First read right away, then keep polling while the page is open.
    const first = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, POLL_MS);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [active, refresh]);
  return { status, refresh };
}
