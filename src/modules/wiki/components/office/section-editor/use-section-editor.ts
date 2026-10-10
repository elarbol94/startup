"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { requestWorkspaceTab } from "@/components/workspace/model";
import type { OfficeStatus } from "../../../office/queries";
import type { OfficeCommand, PluginEvent } from "../use-office-bridge";
import { parseSectionMessage, sectionChannelName, sectionTabLockName, sectionTabPath, tabGoneDecision, TAB_GONE_GRACE_MS, type SectionMessage } from "./section-channel";
import { containsCitations, containsComments, sectionDocumentJson } from "./section-json";
import { parseSectionEditTag, sectionEditTag, sectionRange, staleSectionEdits, type SectionEditLock } from "./section-logic";
import { answerSectionPings, liveSectionEdits } from "./section-presence";

/** A section this tab locked and handed to a section tab. */
export type SectionSession = {
  id: string;
  /** Heading of the section; null for the start of the document. */
  title: string | null;
  /** Document Builder JSON the section tab loads. */
  json: string;
  /** The section tab has received the content. */
  connected: boolean;
  /** The workspace did not open the tab (tab limit); the banner offers to try again. */
  blocked: boolean;
};

/** No answer from the main document's plugin within this time counts as a failure. */
const COMMIT_TIMEOUT_MS = 30_000;

async function connectedUsers(pageId: string) {
  try {
    const response = await fetch(`/api/wiki/office/${encodeURIComponent(pageId)}/status`, { cache: "no-store" });
    if (!response.ok) return null;
    return ((await response.json()) as OfficeStatus).session?.users ?? null;
  } catch {
    return null;
  }
}

/**
 * Main-document side of "Abschnitt separat bearbeiten": works out the section
 * from the plugin's outline, locks it, opens the section tab and hands it the
 * content over the section channel, writes the result back (also for a
 * section tab whose own main tab is gone), releases the lock when the section
 * tab is closed without applying, and releases stale locks when the document
 * opens. See docs/office-documents.md.
 */
export function useSectionEditor(pageId: string, getSlug: () => string, send: (command: OfficeCommand) => void) {
  const t = useTranslations("officeDocuments.sectionEditor");
  const [session, setSessionState] = useState<SectionSession | null>(null);
  const sessionRef = useRef<SectionSession | null>(null);
  const pending = useRef<{ id: string; title: string | null } | null>(null);
  const commits = useRef(new Map<string, number>());
  const channel = useRef<BroadcastChannel | null>(null);
  const tabId = useRef<string | null>(null);
  const pluginReady = useRef(false);
  const watch = useRef<AbortController | null>(null);

  const setSession = useCallback((next: SectionSession | null) => { sessionRef.current = next; setSessionState(next); }, []);
  const patchSession = useCallback((id: string, patch: Partial<SectionSession>) => {
    const current = sessionRef.current;
    if (current?.id === id) setSession({ ...current, ...patch });
  }, [setSession]);
  const post = useCallback((message: SectionMessage) => channel.current?.postMessage(message), []);
  const release = useCallback((id: string) => send({ command: "releaseSection", id }), [send]);
  const end = useCallback((id: string) => {
    if (sessionRef.current?.id !== id) return;
    watch.current?.abort();
    watch.current = null;
    setSession(null);
  }, [setSession]);

  // A platform tab, labelled with the section heading; the workspace explains a refusal (tab limit).
  const openTab = useCallback((id: string) => {
    const title = sessionRef.current?.id === id ? sessionRef.current.title : null;
    const opened = requestWorkspaceTab(sectionTabPath(getSlug(), id), title ?? t("startOfDocument"));
    patchSession(id, { blocked: !opened });
  }, [getSlug, patchSession, t]);

  /** Waits until the section tab's Web Lock is freed (tab closed); then, unless it comes back, discards. */
  const watchTab = useCallback((id: string) => {
    if (typeof navigator === "undefined" || !navigator.locks) return;
    watch.current?.abort();
    const controller = new AbortController();
    watch.current = controller;
    navigator.locks.request(sectionTabLockName(id), { signal: controller.signal }, async () => {}).then(() => {
      window.setTimeout(() => {
        const decision = tabGoneDecision({ sessionId: sessionRef.current?.id ?? null, lockId: id, reconnected: controller.signal.aborted });
        if (decision !== "release") return;
        release(id);
        end(id);
        toast.info(t("tabClosed"));
      }, TAB_GONE_GRACE_MS);
    }, () => { /* aborted: applied, discarded or reconnected */ });
  }, [end, release, t]);

  const commit = useCallback((id: string, json: string) => {
    let citations: boolean;
    try { citations = containsCitations(json); } catch { post({ type: "applied", id, ok: false, reason: "invalid" }); return; }
    window.clearTimeout(commits.current.get(id));
    commits.current.set(id, window.setTimeout(() => {
      commits.current.delete(id);
      post({ type: "applied", id, ok: false, reason: "timeout" });
    }, COMMIT_TIMEOUT_MS));
    send({ command: "commitSection", id, json, citations });
  }, [post, send]);

  const onMessage = useCallback((message: SectionMessage) => {
    const current = sessionRef.current;
    switch (message.type) {
      case "hello":
        if (current?.id !== message.id) return;
        post({ type: "open", id: current.id, title: current.title, json: current.json });
        patchSession(current.id, { connected: true, blocked: false });
        watchTab(current.id);
        return;
      case "who":
        if (!pluginReady.current) return;
        tabId.current ??= crypto.randomUUID();
        post({ type: "here", id: message.id, nonce: message.nonce, tab: tabId.current, owner: current?.id === message.id });
        return;
      case "apply":
        if (message.tab === tabId.current) commit(message.id, message.json);
        return;
      case "discard":
        if (!pluginReady.current) return;
        release(message.id);
        end(message.id);
        return;
      default:
    }
  }, [commit, end, patchSession, post, release, watchTab]);
  const onMessageRef = useRef(onMessage);
  useEffect(() => { onMessageRef.current = onMessage; });

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const current = new BroadcastChannel(sectionChannelName(pageId));
    channel.current = current;
    current.onmessage = (event: MessageEvent<unknown>) => {
      const message = parseSectionMessage(event.data);
      if (message) onMessageRef.current(message);
    };
    return () => { current.close(); channel.current = null; };
  }, [pageId]);

  const releaseStale = useCallback(async (tags: string[], selfId: string) => {
    const locks = tags.map(parseSectionEditTag).filter((lock): lock is SectionEditLock => lock !== null);
    if (!locks.length) return;
    const [liveIds, users] = await Promise.all([liveSectionEdits(pageId), connectedUsers(pageId)]);
    for (const id of [sessionRef.current?.id, pending.current?.id]) if (id) liveIds.add(id);
    for (const lock of staleSectionEdits(locks, { selfId, liveIds, connectedUsers: users, now: Date.now() })) release(lock.id);
  }, [pageId, release]);

  const onPluginEvent = useCallback((event: PluginEvent) => {
    switch (event.type) {
      case "ready":
        pluginReady.current = true;
        // A section tab waiting to apply (its own main tab was closed) retries now.
        post({ type: "mainReady" });
        return;
      case "sectionOutline": {
        if (sessionRef.current || pending.current) { toast.info(t("alreadyOpen")); return; }
        if (event.tracking) { toast.error(t("trackingOn")); return; }
        const blocks = Array.isArray(event.blocks) ? event.blocks : [];
        const result = sectionRange(blocks, event.cursor);
        if (!result.ok) { toast.info(result.reason === "locked" ? t("locked") : t("noPosition")); return; }
        const id = crypto.randomUUID();
        const { start, end, title } = result.range;
        pending.current = { id, title };
        send({
          command: "lockSection", id, start, end, title, count: blocks.length,
          tag: sectionEditTag({ id, user: event.user?.id || "unknown", at: Date.now() }),
          alias: t("lockAlias", { name: event.user?.name || "?" }),
        });
        return;
      }
      case "sectionLocked": {
        const request = pending.current;
        if (!request || request.id !== event.id) { release(event.id); return; }
        pending.current = null;
        let json: string;
        try { json = sectionDocumentJson(event.json); } catch { release(event.id); toast.error(t("failed")); return; }
        if (containsComments(json) && !window.confirm(t("commentsWarning"))) { release(event.id); return; }
        setSession({ id: event.id, title: request.title, json, connected: false, blocked: false });
        openTab(event.id);
        return;
      }
      case "sectionLockFailed": {
        if (pending.current?.id === event.id) pending.current = null;
        if (event.reason === "tracking") toast.error(t("trackingOn"));
        else if (event.reason === "locked") toast.info(t("locked"));
        else if (event.reason === "changed") toast.info(t("changed"));
        else toast.error(t("failed"));
        return;
      }
      case "sectionCommitted": {
        const timer = commits.current.get(event.id);
        if (timer === undefined) return;
        window.clearTimeout(timer);
        commits.current.delete(event.id);
        post({ type: "applied", id: event.id, ok: event.ok, reason: event.reason });
        if (event.ok) { end(event.id); toast.success(t("applied")); }
        return;
      }
      case "sectionLocks":
        void releaseStale(Array.isArray(event.tags) ? event.tags : [], event.self ?? "");
        return;
      default:
    }
  }, [end, openTab, post, release, releaseStale, send, setSession, t]);

  /** Banner "Verwerfen": removes the lock, the section stays as it was; an open section tab is told. */
  const discard = useCallback(() => {
    const current = sessionRef.current;
    if (!current || !window.confirm(t("discardConfirm"))) return;
    release(current.id);
    post({ type: "closed", id: current.id });
    end(current.id);
  }, [end, post, release, t]);

  /** Banner button for a blocked (or accidentally closed, not yet connected) section tab. */
  const reopen = useCallback(() => { if (sessionRef.current) openTab(sessionRef.current.id); }, [openTab]);

  // While a section is open: count as its live editor and warn before leaving the page.
  const openId = session?.id;
  useEffect(() => {
    if (!openId) return;
    const stop = answerSectionPings(pageId, openId);
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => { stop(); window.removeEventListener("beforeunload", warn); };
  }, [openId, pageId]);

  useEffect(() => {
    const timers = commits.current;
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer);
      watch.current?.abort();
    };
  }, []);

  return { session, onPluginEvent, discard, reopen };
}
