"use client";

import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTaskCreator } from "@/modules/tasks/components/task-create-provider";
import { useDeadlineCreator } from "@/modules/tasks/components/deadline-create-provider";
import { notifyOfficeMentions, officeMentionUsers } from "../../office/office-actions";
import { useOnlyofficeScript, type DocEditorInstance } from "./use-onlyoffice-script";

export type OfficeEditorHandle = { downloadAs: (format: "pdf" | "docx") => boolean };

type ConfigResponse = { config: Record<string, unknown>; apiUrl: string };
type LoadState = { kind: "loading" } | { kind: "ready"; data: ConfigResponse } | { kind: "unavailable" } | { kind: "error"; code: string };

type BridgeMessage = { type: "mp-office"; action: "createTask" | "createDeadline"; pageId: string; quote: string };

function isBridgeMessage(data: unknown): data is BridgeMessage {
  const message = data as Partial<BridgeMessage> | null;
  return Boolean(message && message.type === "mp-office" && typeof message.pageId === "string" && typeof message.quote === "string"
    && (message.action === "createTask" || message.action === "createDeadline"));
}

/**
 * Mounts the ONLYOFFICE editor for one page. The document server keeps the
 * co-editing state; `onSynced` reports whether local edits reached it, which
 * is not the same as the app having stored them (see useOfficeStatus).
 */
export function OfficeEditor({ ref, page, query, onSynced, onUnavailable }: {
  ref?: Ref<OfficeEditorHandle>;
  page: { id: string; slug: string; title: string };
  query: { insertEvidence?: string; task?: string; deadline?: string };
  onSynced: (synced: boolean) => void;
  onUnavailable: () => void;
}) {
  const t = useTranslations("officeDocuments");
  const router = useRouter();
  const { openTaskCreator } = useTaskCreator();
  const { openDeadlineCreator } = useDeadlineCreator();
  const elementId = `office-editor-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const editor = useRef<DocEditorInstance | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mounts = useRef(0);
  const callbacks = useRef({ onSynced, onUnavailable });
  useEffect(() => { callbacks.current = { onSynced, onUnavailable }; });
  const script = useOnlyofficeScript(state.kind === "ready" ? state.data.apiUrl : null, attempt);

  useImperativeHandle(ref, () => ({
    downloadAs(format) {
      if (!editor.current) return false;
      editor.current.downloadAs(format);
      return true;
    },
  }), []);

  // Fetch a fresh signed config (joins the current session).
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (query.insertEvidence) params.set("insertEvidence", query.insertEvidence);
    if (query.task) params.set("task", query.task);
    if (query.deadline) params.set("deadline", query.deadline);
    let retry: number | undefined;
    const load = () => fetch(`/api/wiki/office/${encodeURIComponent(page.id)}/config?${params}`, { cache: "no-store" }).then(async (response) => {
      if (cancelled) return;
      if (response.status === 503) { setState({ kind: "unavailable" }); callbacks.current.onUnavailable(); return; }
      if (response.status === 409) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        setState({ kind: "error", code: body.error ?? "conflict" });
        retry = window.setTimeout(load, 3000);
        return;
      }
      if (!response.ok) { setState({ kind: "error", code: "load" }); return; }
      setState({ kind: "ready", data: await response.json() as ConfigResponse });
    }, () => { if (!cancelled) setState({ kind: "error", code: "load" }); });
    void load();
    return () => { cancelled = true; window.clearTimeout(retry); };
  }, [page.id, query.insertEvidence, query.task, query.deadline, attempt]);

  // Create the editor once the script and config are ready. Creation is
  // deferred a tick and always gets a fresh element: an immediate
  // create/destroy/create in the same element (React's development re-run of
  // effects) left Firefox stuck on the loading skeleton.
  useEffect(() => {
    const container = containerRef.current;
    if (state.kind !== "ready" || !script.api || !container) return;
    const api = script.api;
    const config = state.data.config;
    let instance: DocEditorInstance | null = null;
    const timer = window.setTimeout(() => {
      const host = document.createElement("div");
      host.id = `${elementId}-${++mounts.current}`;
      container.replaceChildren(host);
      instance = new api.DocEditor(host.id, {
        ...config,
        width: "100%",
        height: "100%",
        events: {
          onDocumentStateChange: (event: { data: boolean }) => callbacks.current.onSynced(!event.data),
          onError: () => setState({ kind: "error", code: "editor" }),
          onOutdatedVersion: () => setAttempt((value) => value + 1),
          onRequestUsers: (event: { data?: { c?: string } }) => {
            void officeMentionUsers().then((users) => editor.current?.setUsers({ c: event.data?.c, users }));
          },
          onRequestSendNotify: (event: { data?: { emails?: string[] } }) => {
            void notifyOfficeMentions({ pageId: page.id, emails: event.data?.emails ?? [] }).catch(() => toast.error(t("mentionFailed")));
          },
          onDownloadAs: (event: { data?: { url?: string } }) => {
            const url = event.data?.url;
            if (!url) return;
            const link = document.createElement("a");
            link.href = url;
            link.rel = "noopener";
            link.click();
          },
        },
      });
      editor.current = instance;
    }, 0);
    return () => {
      window.clearTimeout(timer);
      editor.current = null;
      try { instance?.destroyEditor(); } catch { /* already gone */ }
      container.replaceChildren();
    };
  }, [state, script.api, elementId, page.id, t]);

  // The plugin asks the page to open the app's task/deadline dialogs.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || !isBridgeMessage(event.data) || event.data.pageId !== page.id || !event.ports[0]) return;
      const port = event.ports[0];
      const origin = {
        type: "wikiPage" as const,
        entityId: page.id,
        route: `/wiki/pages/${encodeURIComponent(page.slug)}`,
        label: page.title,
        anchor: { quote: event.data.quote },
      };
      const onCreated = (id: string) => { port.postMessage({ id }); router.refresh(); };
      if (event.data.action === "createTask") openTaskCreator({ initialTitle: event.data.quote, origin, showProjectSchedule: true, onCreated });
      else openDeadlineCreator({ initialTitle: event.data.quote, origin, onCreated });
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [openDeadlineCreator, openTaskCreator, page.id, page.slug, page.title, router]);

  const failed = state.kind === "error" || script.error;
  return <div className="relative h-full min-h-[32rem] overflow-hidden rounded-md border bg-background">
    {state.kind !== "unavailable" && <div ref={containerRef} className="size-full [&>div]:size-full" />}
    {(state.kind === "loading" || (state.kind === "ready" && !script.api && !script.error)) && <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground"><span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" />{t("loading")}</span></div>}
    {failed && <div className="absolute inset-0 grid place-items-center bg-background/90 p-6 text-center">
      <div className="max-w-sm space-y-3">
        <p className="text-sm">{state.kind === "error" && state.code === "restoreInProgress" ? t("restoreInProgress") : t("loadFailed")}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => { setState({ kind: "loading" }); setAttempt((value) => value + 1); }}><RefreshCw className="size-4" />{t("retry")}</Button>
      </div>
    </div>}
  </div>;
}
