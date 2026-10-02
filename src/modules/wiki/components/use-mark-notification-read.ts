"use client";
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { markNotificationsRead } from "../notification-actions";

/** Returns a handler that marks one unread notification read and refreshes the counts on screen. */
export function useMarkNotificationRead() {
  const router = useRouter();
  return useCallback((item: { id: string; readAt: Date | null }) => {
    if (item.readAt) return undefined;
    return () => { void markNotificationsRead([item.id]).then(() => router.refresh()); };
  }, [router]);
}
