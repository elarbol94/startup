// What the ribbon needs from the editor. Most buttons are editor commands (the same ones the
// command search and context menu run), so a button's label, shortcut, availability and
// on/off state come from one place; the rest are galleries and panes the editor owns.
import type { ReactNode } from "react";
import type { EditorSearchCommand } from "../../editor-command-search";
import type { PresetGalleryEntry } from "../../../lib/preset-shapes/preset-gallery";
import type { TextFormatKey } from "../../../lib/presentation-keyboard-edits";
import type { usePresentationFormatting } from "../use-presentation-formatting";
import type { useRibbonState } from "./use-ribbon-state";

export type RibbonPanel = "properties" | "design" | "assets" | "comments";

export type RibbonModel = {
  state: ReturnType<typeof useRibbonState>;
  commands: EditorSearchCommand[]; run: (id: string) => void; shortcuts: Record<string, string>;
  disabled: boolean; insertDisabled: boolean; uploading: boolean;
  /** Breadcrumb and title field, save state, and the Present link: they navigate through the editor's flush. */
  title: ReactNode; saveStatus: ReactNode; present: (variant: "titleBar" | "ribbon" | "ribbonCurrent") => ReactNode; onLeave: () => void;
  onSearch: () => void;
  pathOpen: boolean; togglePath: () => void;
  activePanel: RibbonPanel | null; togglePanel: (panel: RibbonPanel) => void;
  shapeGallery: { open: boolean; setOpen: (open: boolean) => void; armed: boolean; onPick: (entry: PresetGalleryEntry, options?: { lock?: boolean }) => void };
  addStudio: (kind: "chart" | "icon", choice: string) => void;
  background: string; setBackground: (color: string) => void;
  formatting: ReturnType<typeof usePresentationFormatting>;
  onTextKey: (key: TextFormatKey) => void;
  onOpenPane: (group: "shape" | "text") => void;
};
