"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isWorkspaceFrame } from "@/components/workspace/model";
import { GLOBAL_SHORTCUTS } from "@/lib/app-shortcuts";
import { matchesShortcut } from "@/lib/shortcuts";
import {
  FOCUS_GLOBAL_ATTRIBUTE,
  FOCUS_READER_ATTRIBUTE,
  FOCUS_SCOPES,
  LEGACY_FOCUS_MODE_STORAGE_KEYS,
  focusScopeForPathname,
  focusShortcutAction,
  focusStorageKey,
  preferencesAfterExit,
  resolveFocusState,
  type FocusPreferences,
  type FocusScope,
} from "@/lib/focus-mode";

type FocusModeContextValue = {
  scope: FocusScope | null;
  /** Reader focus of the current wiki route; reader pages also collapse their side panels. */
  isFocused: boolean;
  /** The platform-wide focus mode of the main window. */
  globalFocused: boolean;
  /** Global or reader focus hides the app sidebar and the wiki rail. */
  chromeHidden: boolean;
  /** Reader toggle: enters reader focus, or leaves focus entirely. */
  toggleFocused: () => void;
  setGlobalFocused: (focused: boolean) => void;
  /** Clears global focus, the current reader preference and focused planning. */
  exitFocus: () => void;
  /** What Mod+Shift+F does on this page. */
  handleFocusShortcut: () => void;
  /** Focused Gantt planning registers how to leave it; returns the unregister function. */
  registerPlanningExit: (exit: () => void) => () => void;
};

const FocusModeContext = createContext<FocusModeContextValue | null>(null);
const FOCUS_CHANGE_EVENT = "focus-mode-change";
const FOCUS_TOGGLE_MESSAGE = "app-workspace-focus-toggle";
const SERVER_SNAPSHOT = "false:false:false";

// Browser storage can be disabled or full; focus then still works for this page load.
const memoryPreferences = new Map<string, string>();
let storageFailed = false;

function readStored(key: string): string | null {
  if (!storageFailed) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      storageFailed = true;
    }
  }
  return memoryPreferences.get(key) ?? null;
}

function writeStored(key: string, value: boolean) {
  memoryPreferences.set(key, String(value));
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    storageFailed = true;
  }
  window.dispatchEvent(new Event(FOCUS_CHANGE_EVENT));
}

function readPreferences(userId: string): FocusPreferences {
  return {
    global: readStored(focusStorageKey("global", userId)) === "true",
    pdf: readStored(focusStorageKey("pdf", userId)) === "true",
    note: readStored(focusStorageKey("note", userId)) === "true",
  };
}

/** Reader preferences were once shared by every account in a browser; adopt them once. */
function migrateLegacyPreferences(userId: string) {
  try {
    for (const scope of FOCUS_SCOPES) {
      const legacy = window.localStorage.getItem(LEGACY_FOCUS_MODE_STORAGE_KEYS[scope]);
      if (legacy === null) continue;
      if (window.localStorage.getItem(focusStorageKey(scope, userId)) === null) {
        window.localStorage.setItem(focusStorageKey(scope, userId), legacy);
      }
      window.localStorage.removeItem(LEGACY_FOCUS_MODE_STORAGE_KEYS[scope]);
    }
  } catch {
    // Without storage there is nothing to migrate.
  }
}

function subscribeToFocusPreferences(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (!event.key || event.key.startsWith("management-platform:focus-mode:")) onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(FOCUS_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(FOCUS_CHANGE_EVENT, onStoreChange);
  };
}

const subscribeNever = () => () => {};

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

function applyFocusAttributes(preferences: FocusPreferences, scope: FocusScope | null) {
  const root = document.documentElement;
  const global = preferences.global && !isWorkspaceFrame();
  const reader = resolveFocusState({ preferences, scope, planning: false }).readerFocused;
  if (global) root.setAttribute(FOCUS_GLOBAL_ATTRIBUTE, "true");
  else root.removeAttribute(FOCUS_GLOBAL_ATTRIBUTE);
  if (reader) root.setAttribute(FOCUS_READER_ATTRIBUTE, "true");
  else root.removeAttribute(FOCUS_READER_ATTRIBUTE);
}

export function FocusModeProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const scope = focusScopeForPathname(pathname);
  const getSnapshot = useCallback(() => {
    const preferences = readPreferences(userId);
    return [preferences.global, preferences.pdf, preferences.note].join(":");
  }, [userId]);
  const snapshot = useSyncExternalStore(subscribeToFocusPreferences, getSnapshot, () => SERVER_SNAPSHOT);
  const embedded = useSyncExternalStore(subscribeNever, isWorkspaceFrame, () => false);
  const [globalPreference, pdfPreference, notePreference] = snapshot.split(":").map((value) => value === "true");
  const preferences = useMemo<FocusPreferences>(
    () => ({ global: globalPreference && !embedded, pdf: pdfPreference, note: notePreference }),
    [embedded, globalPreference, notePreference, pdfPreference],
  );
  const state = resolveFocusState({ preferences, scope, planning: false });
  const scopeRef = useRef(scope);
  const userIdRef = useRef(userId);
  const fullscreenToggleRef = useRef(false);
  const planningExitRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    scopeRef.current = scope;
    userIdRef.current = userId;
  }, [scope, userId]);

  useLayoutEffect(() => {
    migrateLegacyPreferences(userId);
  }, [userId]);

  // The bootstrap script sets these before the first paint; keep them in sync from storage
  // (not the hydration snapshot), including after React's dev remount resets <html>.
  useLayoutEffect(() => {
    applyFocusAttributes(readPreferences(userId), scope);
  }, [snapshot, scope, userId]);
  useEffect(() => () => {
    document.documentElement.removeAttribute(FOCUS_GLOBAL_ATTRIBUTE);
    document.documentElement.removeAttribute(FOCUS_READER_ATTRIBUTE);
  }, []);

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
      const key = focusStorageKey(scopeRef.current, userIdRef.current);
      if (readStored(key) === "true") writeStored(key, false);
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

  const registerPlanningExit = useCallback((exit: () => void) => {
    planningExitRef.current = exit;
    return () => {
      if (planningExitRef.current === exit) planningExitRef.current = null;
    };
  }, []);

  const value = useMemo<FocusModeContextValue>(() => {
    const changeFullscreen = (enter: boolean) => {
      fullscreenToggleRef.current = true;
      const request = enter
        ? document.documentElement.requestFullscreen?.()
        : document.fullscreenElement
          ? document.exitFullscreen?.()
          : undefined;
      // Fullscreen needs a user gesture and can be rejected by browser policy.
      // The distraction-free layout remains the deliberate fallback.
      Promise.resolve(request).catch(() => undefined).finally(() => {
        fullscreenToggleRef.current = false;
      });
    };

    const enterReader = () => {
      if (!scope) return;
      writeStored(focusStorageKey(scope, userId), true);
      changeFullscreen(true);
    };

    const setGlobalFocused = (focused: boolean) => {
      if (embedded) return;
      writeStored(focusStorageKey("global", userId), focused);
    };

    const exitFocus = () => {
      const current = readPreferences(userId);
      const next = preferencesAfterExit(current, scope);
      if (current.global !== next.global) writeStored(focusStorageKey("global", userId), false);
      if (scope && current[scope] !== next[scope]) writeStored(focusStorageKey(scope, userId), false);
      if (document.fullscreenElement) changeFullscreen(false);
      planningExitRef.current?.();
    };

    const handleFocusShortcut = () => {
      const current = readPreferences(userId);
      const action = focusShortcutAction({
        state: resolveFocusState({
          preferences: { ...current, global: current.global && !embedded },
          scope,
          planning: planningExitRef.current !== null,
        }),
        scope,
        embedded,
      });
      if (action === "exit") exitFocus();
      else if (action === "enterReader") enterReader();
      else if (action === "enterGlobal") setGlobalFocused(true);
      else window.parent.postMessage({ type: FOCUS_TOGGLE_MESSAGE }, window.location.origin);
    };

    return {
      scope,
      isFocused: state.readerFocused,
      globalFocused: preferences.global,
      chromeHidden: state.chromeHidden,
      toggleFocused: () => (state.readerFocused ? exitFocus() : enterReader()),
      setGlobalFocused,
      exitFocus,
      handleFocusShortcut,
      registerPlanningExit,
    };
  }, [embedded, preferences.global, registerPlanningExit, scope, state.chromeHidden, state.readerFocused, userId]);

  const shortcutRef = useRef(value.handleFocusShortcut);
  useEffect(() => {
    shortcutRef.current = value.handleFocusShortcut;
  });

  useEffect(() => {
    // A modifier shortcut, so it also works while typing (like Mod+K). Readers that bind the
    // same keys handle them first and call preventDefault.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing) return;
      if (!matchesShortcut(event, GLOBAL_SHORTCUTS.focusMode)) return;
      event.preventDefault();
      shortcutRef.current();
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== FOCUS_TOGGLE_MESSAGE) return;
      const panes = document.querySelectorAll<HTMLIFrameElement>('iframe[data-workspace-pane="true"]');
      if (![...panes].some((pane) => pane.contentWindow === event.source)) return;
      shortcutRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    if (!embedded) window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("message", onMessage);
    };
  }, [embedded]);

  return <FocusModeContext.Provider value={value}>{children}</FocusModeContext.Provider>;
}

export function useFocusMode() {
  const value = useContext(FocusModeContext);
  if (!value) throw new Error("useFocusMode must be used inside FocusModeProvider");
  return value;
}

/** Lets "leave focus" also close focused Gantt planning while it is active. */
export function usePlanningFocusExit(active: boolean, exit: () => void) {
  const { registerPlanningExit } = useFocusMode();
  const exitRef = useRef(exit);
  useEffect(() => {
    exitRef.current = exit;
  });
  useEffect(() => {
    if (!active) return;
    return registerPlanningExit(() => exitRef.current());
  }, [active, registerPlanningExit]);
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
