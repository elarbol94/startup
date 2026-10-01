"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  FOCUS_MODE_STORAGE_KEYS,
  focusScopeForPathname,
  type FocusScope,
} from "@/lib/focus-mode";

type FocusModeContextValue = {
  scope: FocusScope | null;
  isFocused: boolean;
  setFocused: (focused: boolean) => void;
  toggleFocused: () => void;
};

const FocusModeContext = createContext<FocusModeContextValue | null>(null);
const SERVER_SNAPSHOT = "false:false";

function focusPreferencesSnapshot() {
  return [
    window.localStorage.getItem(FOCUS_MODE_STORAGE_KEYS.pdf) === "true",
    window.localStorage.getItem(FOCUS_MODE_STORAGE_KEYS.note) === "true",
  ].join(":");
}

function subscribeToFocusPreferences(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (!event.key || Object.values(FOCUS_MODE_STORAGE_KEYS).includes(event.key)) onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("focus-mode-change", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("focus-mode-change", onStoreChange);
  };
}

/**
 * Firefox can come out of a fullscreen transition with focus on <body> while
 * it still treats an embedded frame as focused. Keys then go to <body>, and
 * neither clicking into the Word editor (ONLYOFFICE suppresses the default
 * focus on mousedown) nor `iframe.focus()` brings them back: typing is lost.
 * Focusing <body> resyncs the browser; focus then returns where it was.
 */
function restoreFocusAfterFullscreen(previous: Element | null) {
  const body = document.body;
  if (document.activeElement !== body) return;
  const hadTabIndex = body.hasAttribute("tabindex");
  if (!hadTabIndex) body.tabIndex = -1;
  body.focus({ preventScroll: true });
  if (!hadTabIndex) body.removeAttribute("tabindex");
  if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
}

export function FocusModeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const scope = focusScopeForPathname(pathname);
  const snapshot = useSyncExternalStore(subscribeToFocusPreferences, focusPreferencesSnapshot, () => SERVER_SNAPSHOT);
  const [pdfPreference, notePreference] = snapshot.split(":").map((value) => value === "true");
  const scopeRef = useRef(scope);
  const fullscreenToggleRef = useRef(false);

  useEffect(() => {
    scopeRef.current = scope;
  }, [scope]);

  useEffect(() => {
    // Where focus was before the fullscreen transition; an iframe (the Word
    // editor) only shows up as the active element when the window blurs.
    let lastFocused: Element | null = null;
    const remember = (element: Element | null) => {
      if (element && element !== document.body) lastFocused = element;
    };
    const onFocusIn = (event: FocusEvent) => remember(event.target as Element | null);
    const onWindowBlur = () => remember(document.activeElement);
    const onFullscreenChange = () => {
      restoreFocusAfterFullscreen(lastFocused);
      if (document.fullscreenElement || fullscreenToggleRef.current || !scopeRef.current) return;
      const key = FOCUS_MODE_STORAGE_KEYS[scopeRef.current];
      if (window.localStorage.getItem(key) === "true") {
        window.localStorage.setItem(key, "false");
        window.dispatchEvent(new Event("focus-mode-change"));
      }
    };
    document.addEventListener("focusin", onFocusIn);
    window.addEventListener("blur", onWindowBlur);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("blur", onWindowBlur);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, []);

  const value = useMemo<FocusModeContextValue>(() => {
    const setFocused = (focused: boolean) => {
      if (!scope) return;
      window.localStorage.setItem(FOCUS_MODE_STORAGE_KEYS[scope], String(focused));
      window.dispatchEvent(new Event("focus-mode-change"));
      fullscreenToggleRef.current = true;
      const fullscreen = focused
        ? document.documentElement.requestFullscreen?.()
        : document.fullscreenElement
          ? document.exitFullscreen?.()
          : undefined;
      // Fullscreen needs a user gesture and can be rejected by browser policy.
      // The existing distraction-free layout remains the deliberate fallback.
      Promise.resolve(fullscreen).catch(() => undefined).finally(() => {
        fullscreenToggleRef.current = false;
      });
    };

    const isFocused = scope === "pdf" ? pdfPreference : scope === "note" ? notePreference : false;
    return { scope, isFocused, setFocused, toggleFocused: () => setFocused(!isFocused) };
  }, [notePreference, pdfPreference, scope]);

  return <FocusModeContext.Provider value={value}>{children}</FocusModeContext.Provider>;
}

export function useFocusMode() {
  const value = useContext(FocusModeContext);
  if (!value) throw new Error("useFocusMode must be used inside FocusModeProvider");
  return value;
}

export function FocusModeToggle({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("wiki");
  const { scope, isFocused, toggleFocused } = useFocusMode();
  if (!scope) return null;

  const label = isFocused ? t("exitFocusMode") : t("enterFocusMode");
  const Icon = isFocused ? Minimize2 : Maximize2;
  return (
    <Button
      type="button"
      variant={isFocused ? "secondary" : "ghost"}
      size={compact ? "icon-sm" : "sm"}
      aria-label={label}
      aria-pressed={isFocused}
      title={label}
      data-testid="focus-mode-toggle"
      onClick={toggleFocused}
    >
      <Icon className="size-4" />
      {!compact && label}
    </Button>
  );
}
