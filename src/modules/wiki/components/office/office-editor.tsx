"use client";

import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserIdentities } from "@/components/user-identity";
import { notifyOfficeMentions, officeMentionUsers } from "../../office/office-actions";
import { OfficeInsertDialog } from "./office-insert-dialog";
import { useOfficeBridge, type OfficeCommand, type PluginEvent } from "./use-office-bridge";
import { applyOfficeUserColors } from "./office-user-colors";
import { useOnlyofficeScript, type DocEditorInstance } from "./use-onlyoffice-script";

export type OfficeEditorHandle = {
  downloadAs: (format: "pdf" | "docx") => boolean;
  /** Sends a command to the workspace plugin (e.g. jump to a linked passage). */
  send: (command: OfficeCommand) => void;
};

type ConfigResponse = { config: Record<string, unknown>; apiUrl: string; bridgeId: string };
type LoadState = { kind: "loading" } | { kind: "ready"; data: ConfigResponse } | { kind: "unavailable" } | { kind: "error"; code: string };

/**
 * Tabs we do not use (Draw, Protection, the plugin manager: the Workspace tab
 * replaces it). The Community edition ignores `customization.layout`, but the
 * editor frame is same-origin, so a stylesheet can hide them. If ONLYOFFICE
 * changes its markup the tabs simply show again.
 */
const HIDDEN_TABS = ["draw", "protect", "plugins"];

function editorFrame(container: HTMLElement) {
  return container.querySelector<HTMLIFrameElement>('iframe[name="frameEditor"]');
}

function hideUnusedTabs(container: HTMLElement) {
  const document = editorFrame(container)?.contentDocument;
  if (!document || document.getElementById("workspace-tabs")) return;
  const style = document.createElement("style");
  style.id = "workspace-tabs";
  style.textContent = HIDDEN_TABS.map((tab) => `.ribtab:has(> [data-tab="${tab}"])`).join(",\n") + " { display: none !important; }";
  document.head.appendChild(style);
}

/**
 * The editor remembers its own theme in (our origin's) localStorage, which
 * overrides `customization.uiTheme`. Drop it when it no longer matches the app.
 */
function followAppTheme(theme: "light" | "dark") {
  const wanted = theme === "dark" ? "theme-dark" : "theme-light";
  try {
    const stored = JSON.parse(window.localStorage.getItem("ui-theme") ?? "null") as { id?: string } | null;
    if (stored?.id !== wanted) {
      window.localStorage.removeItem("ui-theme");
      window.localStorage.removeItem("ui-theme-id");
    }
  } catch {
    window.localStorage.removeItem("ui-theme");
  }
}

/**
 * Mounts the ONLYOFFICE editor for one page. The document server keeps the
 * co-editing state; `onSynced` reports whether local edits reached it, which
 * is not the same as the app having stored them (see useOfficeStatus).
 */
export function OfficeEditor({ ref, page, query, onSynced, onUnavailable, onPluginEvent }: {
  ref?: Ref<OfficeEditorHandle>;
  page: { id: string; slug: string; title: string };
  query: { insertEvidence?: string; task?: string; deadline?: string; officeAction?: string };
  onSynced: (synced: boolean) => void;
  onUnavailable: () => void;
  onPluginEvent?: (event: PluginEvent) => void;
}) {
  const t = useTranslations("officeDocuments");
  // The editor follows the app's appearance; it reloads when that changes.
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "dark" : resolvedTheme === "light" ? "light" : null;
  const elementId = `office-editor-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const editor = useRef<DocEditorInstance | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mounts = useRef(0);
  const callbacks = useRef({ onSynced, onUnavailable });
  useEffect(() => { callbacks.current = { onSynced, onUnavailable }; });
  // Users keep their app colour in the editor (comments, cursors, track changes).
  const identities = useUserIdentities();
  const identitiesRef = useRef(identities);
  useEffect(() => {
    identitiesRef.current = identities;
    if (containerRef.current) applyOfficeUserColors(editorFrame(containerRef.current), identities);
  }, [identities]);
  const script = useOnlyofficeScript(state.kind === "ready" ? state.data.apiUrl : null, attempt);
  const bridge = useOfficeBridge(
    state.kind === "ready" ? state.data.bridgeId : null,
    page,
    onPluginEvent,
    !(query.insertEvidence || query.task || query.deadline || query.officeAction),
  );
  const send = bridge.send;

  useImperativeHandle(ref, () => ({
    downloadAs(format) {
      if (!editor.current) return false;
      editor.current.downloadAs(format);
      return true;
    },
    send,
  }), [send]);

  // Fetch a fresh signed config (joins the current session).
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (query.insertEvidence) params.set("insertEvidence", query.insertEvidence);
    if (query.task) params.set("task", query.task);
    if (query.deadline) params.set("deadline", query.deadline);
    if (query.officeAction) params.set("officeAction", query.officeAction);
    if (!theme) return;
    params.set("theme", theme);
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
  }, [page.id, query.insertEvidence, query.task, query.deadline, query.officeAction, theme, attempt]);

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
      if (theme) followAppTheme(theme);
      const host = document.createElement("div");
      host.id = `${elementId}-${++mounts.current}`;
      container.replaceChildren(host);
      instance = new api.DocEditor(host.id, {
        ...config,
        width: "100%",
        height: "100%",
        events: {
          onAppReady: () => {
            hideUnusedTabs(container);
            applyOfficeUserColors(editorFrame(container), identitiesRef.current);
          },
          onDocumentStateChange: (event: { data: boolean }) => callbacks.current.onSynced(!event.data),
          onError: () => setState({ kind: "error", code: "editor" }),
          onOutdatedVersion: () => setAttempt((value) => value + 1),
          onRequestUsers: (event: { data?: { c?: string } }) => {
            void officeMentionUsers().then((users) => editor.current?.setUsers({ c: event.data?.c, users }));
          },
          onRequestSendNotify: (event: { data?: { emails?: string[]; actionLink?: unknown } }) => {
            const actionLink = event.data?.actionLink ? JSON.stringify(event.data.actionLink) : undefined;
            void notifyOfficeMentions({ pageId: page.id, emails: event.data?.emails ?? [], actionLink }).catch(() => toast.error(t("mentionFailed")));
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
      // Colour the users before the editor draws its first avatars.
      const frame = editorFrame(container);
      frame?.addEventListener("load", () => applyOfficeUserColors(frame, identitiesRef.current), { once: true });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      editor.current = null;
      try { instance?.destroyEditor(); } catch { /* already gone */ }
      container.replaceChildren();
    };
  }, [state, script.api, elementId, page.id, t, theme]);

  const failed = state.kind === "error" || script.error;
  return <div className="relative h-full min-h-[18rem] overflow-hidden rounded-md border bg-background">
    {state.kind !== "unavailable" && <div ref={containerRef} className="size-full [&>div]:size-full" />}
    {(state.kind === "loading" || (state.kind === "ready" && !script.api && !script.error)) && <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground"><span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" />{t("loading")}</span></div>}
    {failed && <div className="absolute inset-0 grid place-items-center bg-background/90 p-6 text-center">
      <div className="max-w-sm space-y-3">
        <p className="text-sm">{state.kind === "error" && state.code === "restoreInProgress" ? t("restoreInProgress") : t("loadFailed")}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => { setState({ kind: "loading" }); setAttempt((value) => value + 1); }}><RefreshCw className="size-4" />{t("retry")}</Button>
      </div>
    </div>}
    {bridge.resume && <button type="button" onClick={bridge.resume} className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border bg-background px-3 py-1.5 text-xs shadow-md hover:bg-accent">{t("resumePosition")}</button>}
    <OfficeInsertDialog pageId={page.id} kind={bridge.dialog} onClose={bridge.closeDialog} onInsert={bridge.insert} />
  </div>;
}
