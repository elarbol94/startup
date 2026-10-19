"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadMailFolders, loadMailMessage, loadMailMessages } from "../../message-actions";
import type { MailErrorCode, MailFolder, MailListPage, MailMessage, MailResult } from "../../types";

/** How often the open folder and the unread counts are refreshed. */
const POLL_MS = 60_000;

export type Loadable<T> = { status: "idle" } | { status: "loading" } | { status: "ready"; value: T } | { status: "error"; error: MailErrorCode; detail?: string };

type Keyed<T> = { key: string; data: Loadable<T> };

/**
 * Loads `fetcher(key)` whenever `key` changes and every POLL_MS while the tab
 * is visible. State is tagged with the key it belongs to, so a new key reads
 * as "loading" without resetting state inside the effect. A failed background
 * refresh keeps what is already shown.
 */
function usePolledResource<T>(key: string, fetcher: (key: string) => Promise<MailResult<T>>) {
  const [state, setState] = useState<Keyed<T>>({ key: "", data: { status: "idle" } });
  const latest = useRef(0);
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const load = useCallback(async (target: string, quiet: boolean) => {
    const id = ++latest.current;
    const result = await fetcherRef.current(target);
    if (id !== latest.current) return; // superseded by a newer request
    setState((previous) => {
      if (result.ok) return { key: target, data: { status: "ready", value: result.value } };
      if (quiet && previous.key === target && previous.data.status === "ready") return previous;
      return { key: target, data: { status: "error", error: result.error, detail: result.detail } };
    });
  }, []);

  useEffect(() => {
    if (!key) return;
    void load(key, false);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(key, true);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [key, load]);

  /** Reloads now; `quiet` keeps the current content visible meanwhile. */
  const refresh = useCallback(async (quiet = false) => {
    if (!key) return;
    if (!quiet) setState({ key, data: { status: "loading" } });
    await load(key, quiet);
  }, [key, load]);

  /** Applies a local change right away (flags, removal) until the next refresh. */
  const patch = useCallback((update: (value: T) => T) => {
    setState((previous) => (previous.data.status === "ready" ? { key: previous.key, data: { status: "ready", value: update(previous.data.value) } } : previous));
  }, []);

  const data: Loadable<T> = !key ? { status: "idle" } : state.key === key ? state.data : { status: "loading" };
  return { data, refresh, patch };
}

/** Folders of the account with unread counts. */
export function useMailFolders(accountId: string | null) {
  const { data, refresh } = usePolledResource<MailFolder[]>(accountId ?? "", (id) => loadMailFolders({ accountId: id }));
  return { folders: data, refreshFolders: refresh };
}

export type MessageQuery = { accountId: string; folder: string; page: number; query: string; unreadOnly: boolean };

/** One page of the open folder, newest first. */
export function useMailMessages(query: MessageQuery | null) {
  const { data, refresh, patch } = usePolledResource<MailListPage>(query ? JSON.stringify(query) : "", (key) => {
    const current = JSON.parse(key) as MessageQuery;
    return loadMailMessages({ ...current, query: current.query || undefined });
  });
  return { messages: data, refreshMessages: refresh, patchMessages: patch };
}

export type OpenMessageRef = { accountId: string; folder: string; uid: number };

/** The open message, loaded once per selection (reading it marks it as read). */
export function useMailMessage(ref: OpenMessageRef | null) {
  const key = ref ? `${ref.accountId}\u0000${ref.folder}\u0000${ref.uid}` : "";
  const [state, setState] = useState<Keyed<MailMessage>>({ key: "", data: { status: "idle" } });

  useEffect(() => {
    if (!key) return;
    const [accountId, folder, uid] = key.split("\u0000");
    let cancelled = false;
    void loadMailMessage({ accountId, folder, uid: Number(uid) }).then((result) => {
      if (cancelled) return;
      setState({ key, data: result.ok ? { status: "ready", value: result.value } : { status: "error", error: result.error, detail: result.detail } });
    });
    return () => { cancelled = true; };
  }, [key]);

  const patch = useCallback((update: (message: MailMessage) => MailMessage) => {
    setState((previous) => (previous.data.status === "ready" ? { key: previous.key, data: { status: "ready", value: update(previous.data.value) } } : previous));
  }, []);

  const message: Loadable<MailMessage> = !key ? { status: "idle" } : state.key === key ? state.data : { status: "loading" };
  return { message, patchMessage: patch };
}
