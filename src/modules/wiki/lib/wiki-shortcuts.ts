// Shortcuts of the research workspace (/wiki), in the notation of src/lib/shortcuts.ts.
// German mnemonics as in src/lib/app-shortcuts.ts.
import { PAGE_SHORTCUTS } from "@/lib/app-shortcuts";

export const WIKI_SHORTCUTS = {
  /**
   * "Neues Dokument" into the Eingang. Was Mod+Shift+N, which Chrome keeps for its incognito
   * window and never passes to the page.
   */
  quickNote: "Mod+Shift+E",
  /** Focus the research search, like "/" on every other page. Mod+K stays the global search. */
  search: PAGE_SHORTCUTS.search,
} as const;
