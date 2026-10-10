"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTaskCreator } from "@/modules/tasks/components/task-create-provider";
import { useDeadlineCreator } from "@/modules/tasks/components/deadline-create-provider";
import type { InsertKind, InsertResult } from "./office-insert-dialog";
import type { OutlineHeading, OutlineReason } from "./office-sections";

/** Commands the workspace plugin applies inside the document (public/onlyoffice-plugins/management/plugin.js). */
export type OfficeCommand =
  | { command: "insertCitation"; ids: string[]; loc?: string }
  | { command: "updateCitations" }
  | { command: "insertEvidence"; item: unknown }
  | { command: "insertLink"; page: unknown }
  | { command: "wrapSelection"; kind: "task" | "deadline"; id: string }
  | { command: "select"; kind: "cite" | "evidence" | "task" | "deadline"; id: string }
  | { command: "collectParagraphs" }
  | { command: "goToParagraph"; index: number }
  | { command: "readOutline"; reason: "previous" | "next" }
  | { command: "selectIssue"; id: string; index: number; offset: number; length: number; expected: string }
  | { command: "replaceIssue"; id: string; index: number; offset: number; length: number; expected: string; replacement: string };

/** Plugin messages the page (not the bridge) handles, e.g. the grammar check. */
export type PluginEvent =
  | { type: "grammarRequested" }
  | { type: "paragraphs"; paragraphs: Array<{ index: number; text: string }> }
  | { type: "issueResult"; id: string; result: "ok" | "stale"; replaced?: boolean }
  /** Headings and cursor for "focus on section" (see office-sections.ts). */
  | { type: "outline"; reason: OutlineReason; cursor: number; headings: OutlineHeading[] };

type PluginMessage =
  | { type: "ready" }
  | { type: "position"; index: number }
  | { type: "request"; action: InsertKind | "task" | "deadline" | "grammar"; quote?: string }
  | Exclude<PluginEvent, { type: "grammarRequested" }>
  | { type: "notice"; kind: "success" | "info" | "error"; text: string };

/** Shorter positions are within the first page or so: no prompt. */
const RESUME_MIN_PARAGRAPH = 15;
const RESUME_VISIBLE_MS = 5000;
const POSITION_KEY_PREFIX = "wiki:office-position:";

function loadOfficePosition(pageId: string): number | null {
  try {
    const value = Number(window.localStorage.getItem(POSITION_KEY_PREFIX + pageId));
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch { return null; }
}

function saveOfficePosition(pageId: string, index: number) {
  try { window.localStorage.setItem(POSITION_KEY_PREFIX + pageId, String(index)); } catch { /* storage unavailable */ }
}

/**
 * Same-origin channel between this page and the editor's workspace plugin.
 * The plugin's toolbar buttons ask the page to open its dialogs; the page
 * answers with commands. `bridgeId` is unique per editor instance.
 */
export function useOfficeBridge(
  bridgeId: string | null,
  page: { id: string; slug: string; title: string },
  onEvent?: (event: PluginEvent) => void,
  /** Offer to resume at the last cursor position (off when a link already points somewhere). */
  restorePosition = true,
) {
  const router = useRouter();
  const { openTaskCreator } = useTaskCreator();
  const { openDeadlineCreator } = useDeadlineCreator();
  const channel = useRef<BroadcastChannel | null>(null);
  const [ready, setReady] = useState(false);
  const [resumeIndex, setResumeIndex] = useState<number | null>(null);
  const [dialog, setDialog] = useState<InsertKind | null>(null);
  const events = useRef(onEvent);
  useEffect(() => { events.current = onEvent; });

  const send = useCallback((message: OfficeCommand) => {
    channel.current?.postMessage({ type: "command", ...message });
  }, []);

  useEffect(() => {
    if (!bridgeId || typeof BroadcastChannel === "undefined") return;
    const current = new BroadcastChannel(`mp-office:${bridgeId}`);
    channel.current = current;
    current.onmessage = (event: MessageEvent<PluginMessage>) => {
      const message = event.data;
      if (message.type === "ready") {
        setReady(true);
        const saved = restorePosition ? loadOfficePosition(page.id) : null;
        if (saved !== null && saved >= RESUME_MIN_PARAGRAPH) setResumeIndex(saved);
        return;
      }
      if (message.type === "position") { saveOfficePosition(page.id, message.index); return; }
      if (message.type === "paragraphs" || message.type === "issueResult" || message.type === "outline") { events.current?.(message); return; }
      if (message.type === "notice") {
        if (message.kind === "error") toast.error(message.text);
        else if (message.kind === "info") toast.info(message.text);
        else toast.success(message.text);
        return;
      }
      if (message.type !== "request") return;
      if (message.action === "grammar") { events.current?.({ type: "grammarRequested" }); return; }
      if (message.action === "task" || message.action === "deadline") {
        const kind = message.action;
        const quote = message.quote ?? "";
        const origin = { type: "wikiPage" as const, entityId: page.id, route: `/wiki/pages/${encodeURIComponent(page.slug)}`, label: page.title, anchor: { quote } };
        const onCreated = (id: string) => { send({ command: "wrapSelection", kind, id }); router.refresh(); };
        if (kind === "task") openTaskCreator({ initialTitle: quote, origin, showProjectSchedule: true, onCreated });
        else openDeadlineCreator({ initialTitle: quote, origin, onCreated });
        return;
      }
      setDialog(message.action);
    };
    return () => { current.close(); channel.current = null; setReady(false); };
  }, [bridgeId, restorePosition, openDeadlineCreator, openTaskCreator, page.id, page.slug, page.title, router, send]);

  useEffect(() => {
    if (resumeIndex === null) return;
    const timer = window.setTimeout(() => setResumeIndex(null), RESUME_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [resumeIndex]);

  const resume = resumeIndex === null ? null : () => { send({ command: "goToParagraph", index: resumeIndex }); setResumeIndex(null); };

  const insert = useCallback((result: InsertResult) => {
    if (result.kind === "cite") send({ command: "insertCitation", ids: result.ids, loc: result.loc });
    else if (result.kind === "evidence") send({ command: "insertEvidence", item: result.item });
    else send({ command: "insertLink", page: result.page });
  }, [send]);

  return { ready, send, resume, dialog, closeDialog: () => setDialog(null), insert };
}
