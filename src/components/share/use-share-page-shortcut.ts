"use client";

// Mod+Shift+L copies the link of the page in front (see share-target.ts). Registered by
// AppWorkspace, which also runs inside workspace panes, so the pane with focus answers.
import { useKeyboardShortcut } from "@/components/use-keyboard-shortcut";
import { GLOBAL_SHORTCUTS } from "@/lib/app-shortcuts";
import { currentPageShareTarget } from "./share-target";
import { useShareLink } from "./use-share-link";

export function useSharePageShortcut() {
  const { copyLink } = useShareLink();
  useKeyboardShortcut(GLOBAL_SHORTCUTS.copyPageLink, () => void copyLink(currentPageShareTarget()));
}
