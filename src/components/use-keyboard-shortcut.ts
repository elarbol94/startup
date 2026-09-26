"use client";

// Registers a keyboard shortcut (see lib/shortcuts.ts for the notation) with one shared window
// listener, so "G P" sequences and single-key page shortcuts are resolved together. Shortcuts
// never fire while typing or from inside dialogs/menus, and yield to handlers that already
// called preventDefault. Pair with <ShortcutTooltip> to show the binding on hover.
import { useEffect, useRef } from "react";
import {
  isShortcutBlockedTarget,
  parseShortcut,
  resolveShortcut,
  SEQUENCE_TIMEOUT_MS,
  type KeyStep,
  type ParsedShortcut,
} from "@/lib/shortcuts";

type Registration = { steps: ParsedShortcut; handler: () => void };

const registrations = new Set<Registration>();
let pending: { step: KeyStep; at: number } | null = null;
let listening = false;

function onKeyDown(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing || event.repeat) return;
  if (isShortcutBlockedTarget(event.target)) {
    pending = null;
    return;
  }
  const entries = [...registrations];
  const current = pending && Date.now() - pending.at < SEQUENCE_TIMEOUT_MS ? pending.step : null;
  const result = resolveShortcut(entries.map((entry) => entry.steps), event, current);
  pending = result.pending ? { step: result.pending, at: Date.now() } : null;
  if (result.index === null) return;
  event.preventDefault();
  entries[result.index].handler();
}

function register(registration: Registration) {
  registrations.add(registration);
  if (!listening && typeof window !== "undefined") {
    window.addEventListener("keydown", onKeyDown);
    listening = true;
  }
  return () => {
    registrations.delete(registration);
    if (registrations.size === 0 && listening) {
      window.removeEventListener("keydown", onKeyDown);
      listening = false;
      pending = null;
    }
  };
}

/** Registers a fixed list of shortcuts at once (hooks cannot be called in a loop). */
export function useKeyboardShortcuts(bindings: ReadonlyArray<{ shortcut: string; handler: () => void }>, { enabled = true }: { enabled?: boolean } = {}) {
  const bindingsRef = useRef(bindings);
  useEffect(() => {
    bindingsRef.current = bindings;
  });
  const signature = bindings.map((binding) => binding.shortcut).join("\n");
  useEffect(() => {
    if (!enabled) return;
    const unregister = signature.split("\n").map((shortcut, index) =>
      register({ steps: parseShortcut(shortcut), handler: () => bindingsRef.current[index]?.handler() }),
    );
    return () => unregister.forEach((dispose) => dispose());
  }, [signature, enabled]);
}

export function useKeyboardShortcut(shortcut: string, handler: () => void, { enabled = true }: { enabled?: boolean } = {}) {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });
  useEffect(() => {
    if (!enabled) return;
    return register({ steps: parseShortcut(shortcut), handler: () => handlerRef.current() });
  }, [shortcut, enabled]);
}
