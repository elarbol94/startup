"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTaskCreator } from "@/modules/tasks/components/task-create-provider";
import { useDeadlineCreator } from "@/modules/tasks/components/deadline-create-provider";
import type { InsertKind, InsertResult } from "./office-insert-dialog";

/** Commands the workspace plugin applies inside the document (public/onlyoffice-plugins/management/plugin.js). */
export type OfficeCommand =
  | { command: "insertCitation"; ids: string[]; loc?: string }
  | { command: "updateCitations" }
  | { command: "insertEvidence"; item: unknown }
  | { command: "insertLink"; page: unknown }
  | { command: "wrapSelection"; kind: "task" | "deadline"; id: string }
  | { command: "select"; kind: "cite" | "evidence" | "task" | "deadline"; id: string };

type PluginMessage =
  | { type: "ready" }
  | { type: "request"; action: InsertKind | "task" | "deadline"; quote?: string }
  | { type: "notice"; kind: "success" | "info" | "error"; text: string };

/**
 * Same-origin channel between this page and the editor's workspace plugin.
 * The plugin's toolbar buttons ask the page to open its dialogs; the page
 * answers with commands. `bridgeId` is unique per editor instance.
 */
export function useOfficeBridge(bridgeId: string | null, page: { id: string; slug: string; title: string }) {
  const router = useRouter();
  const { openTaskCreator } = useTaskCreator();
  const { openDeadlineCreator } = useDeadlineCreator();
  const channel = useRef<BroadcastChannel | null>(null);
  const [ready, setReady] = useState(false);
  const [dialog, setDialog] = useState<InsertKind | null>(null);

  const send = useCallback((message: OfficeCommand) => {
    channel.current?.postMessage({ type: "command", ...message });
  }, []);

  useEffect(() => {
    if (!bridgeId || typeof BroadcastChannel === "undefined") return;
    const current = new BroadcastChannel(`mp-office:${bridgeId}`);
    channel.current = current;
    current.onmessage = (event: MessageEvent<PluginMessage>) => {
      const message = event.data;
      if (message.type === "ready") { setReady(true); return; }
      if (message.type === "notice") {
        if (message.kind === "error") toast.error(message.text);
        else if (message.kind === "info") toast.info(message.text);
        else toast.success(message.text);
        return;
      }
      if (message.type !== "request") return;
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
  }, [bridgeId, openDeadlineCreator, openTaskCreator, page.id, page.slug, page.title, router, send]);

  const insert = useCallback((result: InsertResult) => {
    if (result.kind === "cite") send({ command: "insertCitation", ids: result.ids, loc: result.loc });
    else if (result.kind === "evidence") send({ command: "insertEvidence", item: result.item });
    else send({ command: "insertLink", page: result.page });
  }, [send]);

  return { ready, send, dialog, closeDialog: () => setDialog(null), insert };
}
