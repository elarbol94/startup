"use client";

import { closeOwnWorkspaceTab } from "@/components/workspace/model";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { OfficeCommand, PluginEvent } from "../use-office-bridge";
import {
  APPLY_TIMEOUT_MS, HELLO_TIMEOUT_MS, parseSectionMessage, pickApplyTarget, sectionChannelName, sectionTabLockName, WHO_WAIT_MS,
  type SectionMessage,
} from "./section-channel";
import { answerSectionPings } from "./section-presence";

export type SectionTabState =
  | { kind: "connecting" }
  /** The same section is already open in another tab of this browser. */
  | { kind: "busy" }
  /** No main document tab answered (e.g. reloaded after it was closed). */
  | { kind: "orphan" }
  | { kind: "editing"; title: string | null; json: string }
  /** Discarded in the main document, or the section could not be loaded. */
  | { kind: "closed" };

/** "applying": waiting for the main tab; "noMain": no main tab answered, retried on `mainReady`. */
export type ApplyState = "idle" | "applying" | "noMain";

/** Getting the tab's Web Lock: a reload (or React's development re-run) may still hold it for a moment. */
const LOCK_ATTEMPTS = 4;
const LOCK_RETRY_MS = 250;

/**
 * Section tab of "Abschnitt separat bearbeiten": holds the tab's Web Lock,
 * gets the content from the main document tab, answers presence pings while
 * it holds the content, and applies or discards over the section channel.
 * See section-channel.ts and docs/office-documents.md.
 */
export function useSectionTab(pageId: string, id: string, documentPath: string, send: (command: OfficeCommand) => void) {
  const t = useTranslations("officeDocuments.sectionEditor");
  const router = useRouter();
  const [state, setState] = useState<SectionTabState>({ kind: "connecting" });
  const [apply, setApply] = useState<ApplyState>("idle");
  const [loaded, setLoaded] = useState(false);
  const [finished, setFinishedState] = useState(false);
  // Read by the beforeunload handler, which must stop warning before the tab closes itself.
  const finishedRef = useRef(false);
  const setFinished = useCallback((value: boolean) => { finishedRef.current = value; setFinishedState(value); }, []);
  const channel = useRef<BroadcastChannel | null>(null);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; });
  const applyRef = useRef(apply);
  useEffect(() => { applyRef.current = apply; });
  const content = useRef<string | null>(null);
  const who = useRef<{ nonce: string; answers: Array<{ tab: string; owner: boolean }> } | null>(null);
  const timers = useRef<{ hello?: number; who?: number; apply?: number }>({});

  const post = useCallback((message: SectionMessage) => channel.current?.postMessage(message), []);

  const closeTab = useCallback(() => {
    setFinished(true);
    // A platform tab asks the workspace to close it; a browser tab may close itself only when a
    // script opened it. Otherwise (or if neither works) go back to the document.
    window.setTimeout(() => {
      if (!closeOwnWorkspaceTab()) window.close();
      window.setTimeout(() => router.replace(documentPath), 300);
    }, 0);
  }, [documentPath, router, setFinished]);

  /** Finds the main tab that applies (see pickApplyTarget) and sends it the section. */
  const tryApply = useCallback(() => {
    const json = content.current;
    if (json === null) return;
    setApply("applying");
    const nonce = crypto.randomUUID();
    who.current = { nonce, answers: [] };
    post({ type: "who", id, nonce });
    window.clearTimeout(timers.current.who);
    timers.current.who = window.setTimeout(() => {
      const target = pickApplyTarget(who.current?.nonce === nonce ? who.current.answers : []);
      who.current = null;
      if (!target) { setApply("noMain"); return; }
      post({ type: "apply", id, tab: target, json });
      window.clearTimeout(timers.current.apply);
      timers.current.apply = window.setTimeout(() => setApply("noMain"), APPLY_TIMEOUT_MS);
    }, WHO_WAIT_MS);
  }, [id, post]);

  const onMessage = useCallback((message: SectionMessage) => {
    switch (message.type) {
      case "open":
        if (message.id !== id || (stateRef.current.kind !== "connecting" && stateRef.current.kind !== "orphan")) return;
        window.clearTimeout(timers.current.hello);
        setState({ kind: "editing", title: message.title, json: message.json });
        return;
      case "here":
        if (message.id === id && who.current?.nonce === message.nonce) who.current.answers.push({ tab: message.tab, owner: message.owner });
        return;
      case "applied":
        if (message.id !== id) return;
        window.clearTimeout(timers.current.apply);
        if (message.ok) { closeTab(); return; }
        setApply("idle");
        if (message.reason === "missing") toast.error(t("missing"));
        else if (message.reason === "tracking") toast.error(t("trackingOn"));
        else toast.error(t("applyFailed"));
        return;
      case "closed":
        if (message.id !== id) return;
        setFinished(true);
        setState({ kind: "closed" });
        toast.info(t("discardedInDocument"));
        return;
      case "mainReady":
        if (applyRef.current === "noMain") tryApply();
        return;
      default:
    }
  }, [closeTab, id, setFinished, t, tryApply]);
  const onMessageRef = useRef(onMessage);
  useEffect(() => { onMessageRef.current = onMessage; });

  // Web Lock for the tab's lifetime (the main tab notices when it is gone), then the handshake.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") {
      const timer = window.setTimeout(() => setState({ kind: "orphan" }), 0);
      return () => window.clearTimeout(timer);
    }
    let disposed = false;
    let releaseLock: (() => void) | undefined;
    const current = new BroadcastChannel(sectionChannelName(pageId));
    channel.current = current;
    current.onmessage = (event: MessageEvent<unknown>) => {
      const message = parseSectionMessage(event.data);
      if (message) onMessageRef.current(message);
    };
    const hello = () => {
      current.postMessage({ type: "hello", id } satisfies SectionMessage);
      timers.current.hello = window.setTimeout(() => setState((value) => value.kind === "connecting" ? { kind: "orphan" } : value), HELLO_TIMEOUT_MS);
    };
    const acquire = (attempt: number) => {
      void navigator.locks.request(sectionTabLockName(id), { ifAvailable: true }, (lock) => {
        if (disposed) return;
        if (!lock) {
          if (attempt + 1 < LOCK_ATTEMPTS) window.setTimeout(() => { if (!disposed) acquire(attempt + 1); }, LOCK_RETRY_MS);
          else setState({ kind: "busy" });
          return;
        }
        hello();
        return new Promise<void>((resolve) => { releaseLock = resolve; });
      });
    };
    if (navigator.locks) acquire(0);
    else hello();
    const pending = timers.current;
    return () => {
      disposed = true;
      releaseLock?.();
      window.clearTimeout(pending.hello);
      current.close();
      channel.current = null;
    };
  }, [id, pageId]);

  // While it holds the section: count as live for the stale-lock check and warn before leaving.
  const editing = state.kind === "editing" && !finished;
  useEffect(() => {
    if (!editing) return;
    const stop = answerSectionPings(pageId, id);
    const warn = (event: BeforeUnloadEvent) => {
      if (finishedRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => { stop(); window.removeEventListener("beforeunload", warn); };
  }, [editing, id, pageId]);

  useEffect(() => {
    const pending = timers.current;
    return () => { window.clearTimeout(pending.who); window.clearTimeout(pending.apply); };
  }, []);

  const json = state.kind === "editing" ? state.json : null;
  const onPluginEvent = useCallback((event: PluginEvent) => {
    if (event.type === "ready" && json !== null) send({ command: "loadSection", json });
    else if (event.type === "sectionLoaded") {
      if (event.ok) { setLoaded(true); return; }
      toast.error(t("loadFailed"));
      post({ type: "discard", id });
      setFinished(true);
      setState({ kind: "closed" });
    } else if (event.type === "sectionContent") {
      content.current = event.json;
      tryApply();
    }
  }, [id, json, post, send, setFinished, t, tryApply]);

  /** "Übernehmen und schließen": reads the section editor's content, then tryApply. */
  const startApply = useCallback(() => {
    setApply("applying");
    send({ command: "readSection" });
  }, [send]);

  const discard = useCallback(() => {
    if (!window.confirm(t("discardConfirm"))) return;
    post({ type: "discard", id });
    closeTab();
  }, [closeTab, id, post, t]);

  return { state, apply, loaded, finished, onPluginEvent, startApply, retryApply: tryApply, discard };
}
