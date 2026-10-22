"use client";
// Leaving the editor -- the list, "Präsentieren", the PDF export -- once the pending edit
// has been written, with the edit lease handed back. Used by presentation-editor.tsx.
import { useCallback, type RefObject } from "react";
import type { useRouter } from "next/navigation";
import type { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useEditorNavigation } from "../use-editor-navigation";

async function requestEditLease(id: string, sessionId: string, action: "acquire" | "takeover" | "heartbeat" | "release"): Promise<{ editable?: boolean; holderName?: string }> {
  const response = await fetch(`/api/wiki/presentations/${id}/lease`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, action }), keepalive: action === "release",
  });
  if (!response.ok) throw new Error("Edit lease request failed");
  return response.json();
}

export function usePresentationLeave({ flush, presentationId, router, sessionId, t, paused: pausedRef }: {
  flush: () => Promise<boolean>;
  presentationId: string;
  router: ReturnType<typeof useRouter>;
  sessionId: string;
  t: ReturnType<typeof useTranslations<"wiki">>;
  paused: RefObject<boolean>;
}) {
  /** Present and PDF export both read the canvas back from the database, so both have to
   * wait for a pending edit to be written before they hand over. */
  const listHref = "/wiki/presentations";
  const presentHref = `/wiki/presentations/${presentationId}/present`;
  const printHref = `/print/presentations/${presentationId}`;

  /** Hands over to a page rendered from the saved canvas once the pending edit has landed
   * -- flushing nothing when there is nothing to write. A tab that has to be new is opened
   * inside the click -- opening it after the await is what popup blockers exist for -- and
   * only then pointed at the target. A write that fails leaves the author here with their
   * edit and the toast. */
  const flushThen = useCallback((href: string, newTab: boolean, proceed?: () => void) => {
    if (pausedRef.current) return;
    const tab = newTab ? window.open("about:blank", "_blank") : null;
    if (newTab && !tab) {
      toast.error(t("presentations.popupBlocked"));
      return;
    }
    pausedRef.current = true;
    void flush().then(async (saved) => {
      if (!saved) { tab?.close(); toast.error(t("presentations.leaveSaveFailed")); return; }
      if (!newTab) {
        // Hand the lease back before navigation so the next editor can claim it at once.
        await requestEditLease(presentationId, sessionId, "release").catch(() => undefined);
        if (proceed) proceed(); else router.push(href);
      } else if (tab) {
        tab.location.href = href;
      }
    }).catch(() => { tab?.close(); toast.error(t("presentations.leaveSaveFailed")); })
      .finally(() => { pausedRef.current = false; });
  }, [flush, pausedRef, presentationId, router, sessionId, t]);

  useEditorNavigation(flushThen, '[data-testid="presentation-editor"]');
  /** Flush even a clean canvas: a focused field may still hold an uncommitted draft.
   * A modifier click keeps this editor open with its lease and opens a saved copy. */
  const leaveVia = (event: React.MouseEvent, href: string) => {
    const newTab = event.metaKey || event.ctrlKey || event.shiftKey;
    event.preventDefault();
    flushThen(href, newTab);
  };
  /** Middle-click never reaches onClick, and its default is the same new tab. */
  const auxFlush = (event: React.MouseEvent, href: string) => {
    if (event.button !== 1) return;
    event.preventDefault();
    flushThen(href, true);
  };

  return { listHref, presentHref, printHref, flushThen, leaveVia, auxFlush };
}
