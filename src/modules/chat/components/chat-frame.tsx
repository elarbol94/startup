"use client";

import { useRouter } from "next/navigation";
import { requestAppNavigation } from "@/lib/app-navigation";
import { ELEMENT_WEB_URL } from "@/modules/chat/constants";
import { platformLinkPath } from "@/modules/chat/platform-links";

/**
 * Full-bleed Element Web. The app layout drops the workspace padding around
 * `[data-chat-root]`, so the client fills the whole content area.
 *
 * Element opens every link in a new tab. A link to a platform page (shared from
 * here, see components/share/) opens in this window instead, like any in-app link;
 * Ctrl/⌘/middle clicks still open a tab. Element is served from the same origin, so
 * the page can listen inside its document.
 */
export function ChatFrame({ title }: { title: string }) {
  const router = useRouter();

  function interceptPlatformLinks(frame: HTMLIFrameElement) {
    let document: Document | null = null;
    try {
      document = frame.contentDocument;
    } catch {
      return; // Not same-origin after all (another proxy setup): keep Element's behaviour.
    }
    if (!document) return;
    document.addEventListener(
      "click",
      (event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const anchor = (event.target as Element | null)?.closest?.("a[href]");
        if (!anchor || !("href" in anchor) || typeof anchor.href !== "string") return;
        const path = platformLinkPath(anchor.href, window.location.origin);
        if (!path) return;
        // Capture phase on the document runs before Element's own handlers on its root.
        event.preventDefault();
        event.stopPropagation();
        requestAppNavigation(path, () => router.push(path));
      },
      { capture: true },
    );
  }

  return (
    <div data-chat-root className="h-full min-h-0 w-full">
      <iframe
        src={ELEMENT_WEB_URL}
        title={title}
        className="block h-full w-full border-0"
        allow="camera; microphone; display-capture; clipboard-read; clipboard-write; fullscreen"
        // Element reloads itself after signing in or out; every load gets a fresh document.
        onLoad={(event) => interceptPlatformLinks(event.currentTarget)}
      />
    </div>
  );
}
