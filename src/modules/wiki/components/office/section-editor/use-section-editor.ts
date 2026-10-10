"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { OfficeStatus } from "../../../office/queries";
import type { OfficeCommand, PluginEvent } from "../use-office-bridge";
import { containsCitations, containsComments, sectionDocumentJson } from "./section-json";
import { parseSectionEditTag, sectionEditTag, sectionRange, staleSectionEdits, type SectionEditLock } from "./section-logic";
import { answerSectionPings, liveSectionEdits } from "./section-presence";

export type SectionSession = {
  id: string;
  /** Heading of the section; null for the start of the document. */
  title: string | null;
  /** Document Builder JSON the section editor loads. */
  json: string;
  saving: boolean;
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
 * from the plugin's outline, locks it, opens the session for the dialog,
 * writes the result back (or releases the lock) and releases stale locks when
 * the document opens. See docs/office-documents.md.
 */
export function useSectionEditor(pageId: string, send: (command: OfficeCommand) => void) {
  const t = useTranslations("officeDocuments.sectionEditor");
  const [session, setSession] = useState<SectionSession | null>(null);
  const sessionRef = useRef(session);
  useEffect(() => { sessionRef.current = session; });
  const pending = useRef<{ id: string; title: string | null } | null>(null);
  const commitTimer = useRef<number | undefined>(undefined);

  const release = useCallback((id: string) => send({ command: "releaseSection", id }), [send]);

  const releaseStale = useCallback(async (tags: string[], selfId: string) => {
    const locks = tags.map(parseSectionEditTag).filter((lock): lock is SectionEditLock => lock !== null);
    if (!locks.length) return;
    const [liveIds, users] = await Promise.all([liveSectionEdits(pageId), connectedUsers(pageId)]);
    for (const id of [sessionRef.current?.id, pending.current?.id]) if (id) liveIds.add(id);
    for (const lock of staleSectionEdits(locks, { selfId, liveIds, connectedUsers: users, now: Date.now() })) release(lock.id);
  }, [pageId, release]);

  const onPluginEvent = useCallback((event: PluginEvent) => {
    switch (event.type) {
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
        setSession({ id: event.id, title: request.title, json, saving: false });
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
        const current = sessionRef.current;
        if (!current || current.id !== event.id) return;
        window.clearTimeout(commitTimer.current);
        if (event.ok) { setSession(null); toast.success(t("applied")); return; }
        setSession({ ...current, saving: false });
        if (event.reason === "missing") toast.error(t("missing"));
        else if (event.reason === "tracking") toast.error(t("trackingOn"));
        else toast.error(t("applyFailed"));
        return;
      }
      case "sectionLocks":
        void releaseStale(Array.isArray(event.tags) ? event.tags : [], event.self ?? "");
        return;
      default:
    }
  }, [release, releaseStale, send, t]);

  /** Marks the session as saving while the dialog reads the section editor's content. */
  const startSaving = useCallback(() => setSession((current) => current && { ...current, saving: true }), []);

  /** Writes the section editor's content back into the main document. */
  const apply = useCallback((json: string) => {
    const current = sessionRef.current;
    if (!current) return;
    let citations: boolean;
    try { citations = containsCitations(json); } catch {
      setSession({ ...current, saving: false });
      toast.error(t("applyFailed"));
      return;
    }
    send({ command: "commitSection", id: current.id, json, citations });
    window.clearTimeout(commitTimer.current);
    commitTimer.current = window.setTimeout(() => {
      setSession((value) => value && value.id === current.id ? { ...value, saving: false } : value);
      toast.error(t("applyFailed"));
    }, COMMIT_TIMEOUT_MS);
  }, [send, t]);

  /** Closes without changes: the lock is removed, the section stays as it was. */
  const discard = useCallback(() => {
    const current = sessionRef.current;
    if (!current) return;
    window.clearTimeout(commitTimer.current);
    release(current.id);
    setSession(null);
  }, [release]);

  const loadFailed = useCallback(() => { toast.error(t("loadFailed")); discard(); }, [discard, t]);

  // While a section is open: answer presence pings and warn before leaving the page.
  const openId = session?.id;
  useEffect(() => {
    if (!openId) return;
    const stop = answerSectionPings(pageId, openId);
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => { stop(); window.removeEventListener("beforeunload", warn); };
  }, [openId, pageId]);

  useEffect(() => () => window.clearTimeout(commitTimer.current), []);

  return { session, onPluginEvent, startSaving, apply, discard, loadFailed };
}
