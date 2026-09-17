"use client";

import { useEffect } from "react";
import { APP_NAVIGATION_EVENT, type AppNavigationRequest } from "@/lib/app-navigation";

type Navigate = (href: string, newTab: boolean, proceed?: () => void) => void;

/** Route controls outside an editor must wait for its pending writes. */
export function useEditorNavigation(navigate: Navigate, ignoreWithin: string) {
  useEffect(() => {
    const onRequest = (event: Event) => {
      if (event.defaultPrevented) return;
      const { href, proceed } = (event as CustomEvent<AppNavigationRequest>).detail;
      if (new URL(href, window.location.href).pathname === window.location.pathname) return;
      event.preventDefault();
      navigate(href, false, proceed);
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.closest(ignoreWithin) || anchor.hasAttribute("download")) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname) return;
      event.preventDefault();
      event.stopPropagation();
      navigate(`${destination.pathname}${destination.search}${destination.hash}`, event.ctrlKey || event.metaKey || event.shiftKey || anchor.target === "_blank");
    };
    window.addEventListener(APP_NAVIGATION_EVENT, onRequest);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener(APP_NAVIGATION_EVENT, onRequest);
      document.removeEventListener("click", onClick, true);
    };
  }, [navigate, ignoreWithin]);
}
