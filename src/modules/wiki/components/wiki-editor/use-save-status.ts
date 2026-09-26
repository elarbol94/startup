"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { CollaborationClient } from "../../collaboration/provider";
import { useDocumentWorkspace } from "../document-workspace";
import { deriveSaveStatus, SAVE_STALL_MS, type SaveStatus } from "./save-status";

const idle = () => () => {};

/** Subscribes to the page's collaboration transport and returns its save status. */
export function useSaveStatus(provider: CollaborationClient | null): SaveStatus & { recoveryAvailable: boolean } {
  const snapshot = useSyncExternalStore(
    provider?.subscribe ?? idle,
    () => provider ? JSON.stringify([provider.status, provider.errorReason ?? null, provider.savedAt ?? null, provider.recoveryAvailable]) : "",
    () => "",
  );
  // A save that makes no progress (no store confirmed while changes wait) is
  // reported as unsaved instead of "saving" forever.
  const [stalledSnapshot, setStalledSnapshot] = useState<string | null>(null);
  const saving = provider?.status === "saving";
  useEffect(() => {
    if (!saving) return;
    const timer = setTimeout(() => setStalledSnapshot(snapshot), SAVE_STALL_MS);
    return () => clearTimeout(timer);
  }, [saving, snapshot]);
  if (!provider) return { state: "connecting", reason: null, savedAt: null, recoveryAvailable: true };
  return {
    ...deriveSaveStatus({ status: provider.status, errorReason: provider.errorReason, savedAt: provider.savedAt, stalled: stalledSnapshot === snapshot }),
    recoveryAvailable: provider.recoveryAvailable,
  };
}

/** Makes the editor's transport the source of the page header's save status. */
export function usePublishCollaboration(provider: CollaborationClient) {
  const { setCollaboration } = useDocumentWorkspace();
  useEffect(() => {
    setCollaboration(provider);
    return () => setCollaboration((current) => current === provider ? null : current);
  }, [provider, setCollaboration]);
}
