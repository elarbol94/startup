// Which tabs the Eigenschaften pane shows for a selection, in PowerPoint's order, and which one
// opens first. Like PowerPoint's Format pane, the tabs depend on what is selected: a shape gets
// Fill & Line, Effects and (unless it is a line) Text, a picture gets Picture, a frame gets
// Frame, and everything gets Size & Position. Several objects get Arrange plus the tabs that can edit all of them together.
import type { PresentationElement } from "../../../lib/presentation";
import { isTextHost } from "../../../lib/presentation-text-host";

export type PropertiesTab = "fill" | "effects" | "text" | "picture" | "chart" | "icon" | "media" | "frame" | "arrange" | "layout" | "animation";

/** The kind a remembered tab is filed under: the last tab used for pictures is reused for the next picture. */
export function selectionKind(selection: PresentationElement[]): string {
  if (selection.length > 1) return selection.every((element) => element.type === "shape") ? "shapes" : "mixed";
  const element = selection[0];
  if (!element) return "none";
  if (element.type === "frame") return element.content.isGroup ? "group" : "frame";
  return element.type;
}

export function propertiesTabs(selection: PresentationElement[]): PropertiesTab[] {
  if (selection.length > 1) {
    // Fill & Line and Effects edit every selected shape at once.
    return selection.every((element) => element.type === "shape") ? ["arrange", "fill", "effects"] : ["arrange"];
  }
  const element = selection[0];
  if (!element) return [];
  const own: Record<PresentationElement["type"], PropertiesTab[]> = {
    shape: isTextHost(element) ? ["fill", "effects", "text"] : ["fill", "effects"],
    text: ["text"], image: ["picture"], chart: ["chart"], icon: ["icon"], video: ["media"], audio: ["media"], frame: ["frame"],
  };
  return [...own[element.type], "layout", "animation"];
}

/**
 * The tab to show: the one asked for (a ribbon launcher), else the one last used for this kind
 * of object, else the object's own first tab -- what a double-click on it is about.
 */
export function chooseTab(tabs: PropertiesTab[], requested: PropertiesTab | undefined, remembered: PropertiesTab | undefined): PropertiesTab | undefined {
  if (requested && tabs.includes(requested)) return requested;
  if (remembered && tabs.includes(remembered)) return remembered;
  return tabs[0];
}
