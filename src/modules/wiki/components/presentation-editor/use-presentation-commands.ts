"use client";
// The editor's command catalogue: one list drives the command palette, the context menu, the
// ribbon and the keyboard shortcuts, each entry carrying why it is unavailable.
// Used by presentation-editor.tsx.
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { useTranslations } from "next-intl";
import type { useReactFlow } from "@xyflow/react";
import type { EditorSearchCommand } from "../editor-command-search";
import { downloadPresentationPptx } from "../presentation-pptx-download";
import type { PresentationNode } from "../presentation-canvas";
import { isLinearShape, mutableSelection, reorderSelection, selectionRoots } from "../../lib/presentation-interactions";
import { isTextHost } from "../../lib/presentation-text-host";
import { arrangePresentation, presentationAlignments } from "../../lib/presentation-layout";
import type { PresentationFormat } from "../../lib/presentation-format";
import { isPresentationElementLocked, presentationAncestors, presentationDescendants, type PresentationCanvasAction, type PresentationCanvasState, type PresentationElement, type PresentationSettings, type PresentationStep } from "../../lib/presentation";
import type { PresentationBridge } from "../../collaboration/presentation-bridge";
import { presentationShapeToolCommands } from "./presentation-shortcuts";
import type { useDetailScene } from "./use-detail-scene";
import type { usePresentationFormatting } from "./use-presentation-formatting";
import type { usePresentationViewSettings } from "./use-presentation-view-settings";
import type { usePresentationInsertion } from "./use-presentation-insertion";
import type { usePresentationSelectionEdits } from "./use-presentation-selection-edits";
import type { usePresentationSelectionCommands } from "./use-presentation-selection-commands";
import type { usePresentationClipboard } from "./use-presentation-clipboard";
import type { usePresentationWorkspacePanels } from "./use-presentation-workspace-panels";

const CAMERA_DURATION = 700;

export function usePresentationCommands({
  t, studio, tDetails, interact, disabled, elements, steps, settings, canvas, selection, selectedIds, selected, selectedSet, selectedRoots, canMutate, uploading, restoring,
  insertion, setGalleryOpen, setInsertPicker, imageInputRef, mediaInputRef, selectionEdits, selectionCommands, clipboard, formatClipboard, dispatch, undo, reactFlow,
  panels, flush, flushThen, printHref, presentationId, setWorkspaceDialog, openHistory, detail, setWikiImportOpen, miniMapVisible, setMiniMapVisible,
  setSelectedIds, arrangementDisabled, connectSelection, updateElement, setShortcutHelp, formatting, view, setGridDialog,
}: {
  t: ReturnType<typeof useTranslations<"wiki">>;
  studio: ReturnType<typeof useTranslations<"presentationStudio">>;
  tDetails: ReturnType<typeof useTranslations<"wiki.presentations.details">>;
  interact: (key: string) => string;
  disabled: boolean;
  elements: PresentationElement[];
  steps: PresentationStep[];
  settings: PresentationSettings;
  canvas: PresentationCanvasState;
  selection: PresentationElement[];
  selectedIds: string[];
  selected: PresentationElement | null;
  selectedSet: Set<string>;
  selectedRoots: PresentationElement[];
  canMutate: boolean;
  uploading: boolean;
  restoring: string | null;
  insertion: Pick<ReturnType<typeof usePresentationInsertion>, "addText" | "addFrame" | "addShape">;
  setGalleryOpen: Dispatch<SetStateAction<boolean>>;
  setInsertPicker: Dispatch<SetStateAction<"shape" | "chart" | "icon" | null>>;
  imageInputRef: RefObject<HTMLInputElement | null>;
  mediaInputRef: RefObject<HTMLInputElement | null>;
  selectionEdits: ReturnType<typeof usePresentationSelectionEdits>;
  selectionCommands: ReturnType<typeof usePresentationSelectionCommands>;
  clipboard: ReturnType<typeof usePresentationClipboard>;
  formatClipboard: PresentationFormat | null;
  dispatch: (action: PresentationCanvasAction) => void;
  undo: PresentationBridge["undo"];
  reactFlow: ReturnType<typeof useReactFlow<PresentationNode>>;
  panels: ReturnType<typeof usePresentationWorkspacePanels>;
  flush: () => Promise<boolean>;
  flushThen: (href: string, newTab: boolean) => void;
  printHref: string;
  presentationId: string;
  setWorkspaceDialog: Dispatch<SetStateAction<"sharing" | "history" | "playback" | null>>;
  openHistory: () => Promise<void>;
  detail: ReturnType<typeof useDetailScene>;
  setWikiImportOpen: Dispatch<SetStateAction<boolean>>;
  miniMapVisible: boolean;
  setMiniMapVisible: Dispatch<SetStateAction<boolean>>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  arrangementDisabled: boolean;
  connectSelection: () => void;
  updateElement: (id: string, update: (element: PresentationElement) => PresentationElement) => void;
  setShortcutHelp: Dispatch<SetStateAction<boolean>>;
  formatting: ReturnType<typeof usePresentationFormatting>;
  view: ReturnType<typeof usePresentationViewSettings>;
  setGridDialog: Dispatch<SetStateAction<boolean>>;
}) {
  const { addText, addFrame, addShape } = insertion;
  const { deleteSelection, duplicateSelection, copyObjectFormat, pasteObjectFormat } = selectionEdits;
  const { groupSelection, ungroupSelection, editText, setSelectionLocked } = selectionCommands;
  const { copySelection, pasteSelection } = clipboard;
  const { togglePath, pathOpen, openPanel, activePanel, requestProperties } = panels;
  const commandText = t("presentations.commands.title");
  const unavailable = t("presentations.commands.unavailable");
  const insertReason = disabled ? unavailable : elements.length >= 500 ? t("presentations.elementLimit") : undefined;
  const baseCommands: EditorSearchCommand[] = [
    { id: "addText", label: t("presentations.addText"), execute: addText, disabledReason: insertReason, group: commandText },
    { id: "addFrame", label: t("presentations.addFrame"), execute: addFrame, disabledReason: insertReason, group: commandText },
    { id: "addShape", label: t("presentations.addShape"), execute: () => setGalleryOpen(true), disabledReason: insertReason, group: commandText },
    ...presentationShapeToolCommands({ addShape, label: shape => t(`presentations.shapeKinds.${shape}`), disabledReason: insertReason, group: commandText }),
    { id: "addChart", label: studio("addChart"), execute: () => setInsertPicker("chart"), disabledReason: insertReason, group: commandText },
    { id: "addIcon", label: studio("addIcon"), execute: () => setInsertPicker("icon"), disabledReason: insertReason, group: commandText },
    { id: "addImage", label: t("presentations.addImage"), execute: () => imageInputRef.current?.click(), disabledReason: insertReason || (uploading ? unavailable : undefined), group: commandText },
    { id: "uploadMedia", label: studio("uploadMedia"), execute: () => mediaInputRef.current?.click(), disabledReason: insertReason || (uploading ? unavailable : undefined), group: commandText },
    { id: "duplicateSelection", label: t("presentations.duplicateElement"), execute: () => duplicateSelection(selectedIds), disabledReason: disabled || !mutableSelection(elements, selectedIds) ? unavailable : !selection.length ? t("presentations.commands.selectFirst") : elements.length + presentationDescendants(elements, new Set(selectedIds)).size > 500 ? t("presentations.elementLimit") : undefined, contextPriority: selection.length ? 1 : 0, group: commandText },
    { id: "deleteSelection", label: t("presentations.deleteElement"), execute: () => deleteSelection(selectedIds), disabledReason: disabled ? unavailable : !selection.length ? t("presentations.commands.selectFirst") : selection.every(element => isPresentationElementLocked(elements, element.id)) ? unavailable : undefined, group: commandText },
    { id: "undo", label: t("editor.toolbar.undo"), execute: () => dispatch({ type: "undo" }), disabledReason: disabled || !(undo ? undo.canUndo() : canvas.past.length) ? unavailable : undefined, group: commandText },
    { id: "redo", label: t("editor.toolbar.redo"), execute: () => dispatch({ type: "redo" }), disabledReason: disabled || !(undo ? undo.canRedo() : canvas.future.length) ? unavailable : undefined, group: commandText },
    { id: "overview", label: t("presentations.overview"), execute: () => { void reactFlow.fitView({ padding: 0.15, duration: CAMERA_DURATION }); }, group: commandText },
    { id: "path", label: t("presentations.path"), execute: togglePath, active: pathOpen, group: commandText },
    ...(["properties", "design", "assets", "comments"] as const).map(panel => ({ id: panel, label: t(`workspace.${panel}`), execute: () => openPanel(panel), active: activePanel === panel, group: commandText })),
    { id: "save", label: t("presentations.save"), execute: () => { void flush(); }, disabledReason: disabled ? unavailable : undefined, group: commandText },
    { id: "share", label: t("workspace.share"), execute: () => setWorkspaceDialog("sharing"), group: commandText },
    { id: "exportPdf", label: t("presentations.exportPdf"), execute: () => flushThen(printHref, true), disabledReason: !steps.length || restoring !== null || uploading ? unavailable : undefined, group: commandText },
    { id: "exportPptx", label: `${t("presentations.ribbon.exportAs")} ${t("presentations.exportPptx")}`, execute: () => void downloadPresentationPptx(presentationId, flush, { saveFailed: t("presentations.leaveSaveFailed"), failed: t("presentations.exportPptxFailed"), placeholders: t("presentations.exportPptxPlaceholders") }), disabledReason: restoring !== null || uploading ? unavailable : undefined, group: commandText },
    { id: "history", label: t("presentations.history"), execute: openHistory, group: commandText },
    { id: "playback", label: t("presentations.playbackSettings"), execute: () => setWorkspaceDialog("playback"), group: commandText },
    { id: "openDetail", label: selected && detail.frameByBox.has(selected.id) ? tDetails("open") : tDetails("create"), execute: () => { if (selected) detail.open(selected.id); }, disabledReason: !selected || selected.type === "shape" && selected.content.connection ? t("presentations.commands.selectFirst") : !detail.frameByBox.has(selected.id) && insertReason ? insertReason : undefined, group: commandText },
    { id: "closeDetail", label: tDetails("close"), execute: detail.close, disabledReason: detail.sceneId ? undefined : unavailable, group: commandText },
    { id: "removeDetail", label: tDetails("remove"), execute: () => { if (selected) detail.remove(selected.id); }, disabledReason: !disabled && selected && detail.frameByBox.has(selected.id) ? undefined : unavailable, group: commandText },
    { id: "importWiki", label: tDetails("importWiki"), execute: () => setWikiImportOpen(true), disabledReason: !disabled && detail.sceneId ? undefined : unavailable, group: commandText },
    { id: "toggleMiniMap", label: t("presentations.ribbon.miniMap"), execute: () => setMiniMapVisible(value => !value), active: miniMapVisible, disabledReason: elements.length ? undefined : unavailable, group: commandText },
  ];
  const executeCommand = (id: string) => { const command = commands.find(c => c.id === id); if (command && !command.disabledReason) command.execute(); };
  const commands: EditorSearchCommand[] = [
    ...baseCommands,
    { id: "copy", label: interact("copy"), execute: () => copySelection(), group: commandText, disabledReason: (selection.length > 0) ? undefined : unavailable },
    { id: "cut", label: interact("cut"), execute: () => copySelection(true), group: commandText, disabledReason: (canMutate) ? undefined : unavailable },
    { id: "paste", label: interact("paste"), execute: pasteSelection, group: commandText, disabledReason: (!disabled) ? undefined : unavailable },
    { id: "selectAll", label: interact("selectAll"), execute: () => setSelectedIds(selectionRoots(elements, detail.elements.map(e => e.id)).map(e => e.id)), group: commandText, disabledReason: (detail.elements.length > 0) ? undefined : unavailable },
    { id: "group", label: interact("group"), execute: groupSelection, group: commandText, disabledReason: (canMutate && selectedRoots.length >= 2 && elements.length < 500) ? undefined : unavailable },
    { id: "ungroup", label: interact("ungroup"), execute: ungroupSelection, group: commandText, disabledReason: (canMutate && selectedRoots.some(e => e.type === "frame" && e.content.isGroup)) ? undefined : unavailable },
    { id: "editText", label: interact("editText"), execute: editText, group: commandText, disabledReason: (canMutate && isTextHost(selected)) ? undefined : unavailable },
    { id: "copyFormat", label: interact("copyFormat"), execute: copyObjectFormat, group: commandText, disabledReason: (selection.length === 1) ? undefined : unavailable },
    { id: "pasteFormat", label: interact("pasteFormat"), execute: pasteObjectFormat, group: commandText, disabledReason: (canMutate && Boolean(formatClipboard) && selection.some(e => e.type === formatClipboard?.type)) ? undefined : unavailable },
    { id: "lock", label: interact("lock"), execute: () => setSelectionLocked(true), group: commandText, disabledReason: (canMutate) ? undefined : unavailable },
    { id: "unlock", label: interact("unlock"), execute: () => setSelectionLocked(false), group: commandText, disabledReason: (!disabled && selection.some(e => e.locked) && selectedRoots.every(e => !presentationAncestors(elements, e.id).some(p => p.locked))) ? undefined : unavailable },
    ...(["front", "back", "forward", "backward"] as const).map(direction => ({ id: direction, label: interact(direction), execute: () => dispatch({ type: "edit", at: Date.now(), separate: true, elements: current => reorderSelection(current, selectedIds, direction) }), group: commandText, disabledReason: (canMutate) ? undefined : unavailable })),
    ...presentationAlignments.map(mode => ({ id: `align-${mode}`, label: t(`presentations.layout.${mode}`), group: commandText, disabledReason: arrangementDisabled || selectedRoots.length < (["horizontal", "vertical"].includes(mode) ? 3 : 2) ? unavailable : undefined, execute: () => dispatch({ type: "edit", at: Date.now(), separate: true, elements: current => arrangePresentation(current, selectedSet, mode) }) })),
    { id: "connect", label: interact("connect"), execute: connectSelection, group: commandText, disabledReason: (!arrangementDisabled && selectedRoots.length === 2 && elements.length < 500) ? undefined : unavailable },
    { id: "detach", label: interact("detach"), execute: () => { if (selected?.type === "shape") updateElement(selected.id, e => e.type === "shape" ? { ...e, content: { ...e.content, connection: undefined } } : e); }, group: commandText, disabledReason: (canMutate && selected?.type === "shape" && Boolean(selected.content.connection)) ? undefined : unavailable },
    { id: "shortcutHelp", label: interact("shortcutHelp"), execute: () => setShortcutHelp(true), group: commandText },
    { id: "formatShape", label: t(formatting.shapes.length ? "presentations.formatPane.title" : "presentations.formatPane.titleText"), execute: () => { formatting.openPane(formatting.shapes.length ? "shape" : "text"); requestProperties(formatting.shapes.length ? "fill" : "text"); }, group: commandText, disabledReason: (formatting.shapes.length || formatting.texts.length) ? undefined : unavailable },
    { id: "setDefault", label: t(`presentations.formatPane.defaults.${selected?.type === "text" ? "textBox" : selected?.type === "shape" && isLinearShape(selected) ? "line" : "shape"}`), execute: formatting.setAsDefault, group: commandText, disabledReason: formatting.canSetDefault ? undefined : unavailable },
    { id: "editPoints", label: t("presentations.formatPane.editShape.editPoints"), execute: formatting.startEditPoints, group: commandText, disabledReason: formatting.canEditPoints ? undefined : unavailable },
    ...(["union", "combine", "fragment", "intersect", "subtract"] as const).map(op => ({ id: `merge-${op}`, label: `${t("presentations.formatPane.merge.title")}: ${t(`presentations.formatPane.merge.${op}`)}`, execute: () => formatting.mergeSelection(op), group: commandText, disabledReason: formatting.canMerge ? undefined : unavailable })),
    { id: "toggleRuler", label: t("presentations.gridGuides.ruler"), execute: view.toggleRuler, active: settings.ruler, group: commandText },
    { id: "toggleGrid", label: t("presentations.gridGuides.gridlines"), execute: view.toggleGrid, active: settings.grid.show, group: commandText },
    { id: "toggleGuides", label: t("presentations.gridGuides.guides"), execute: view.toggleGuides, active: settings.guides.show, group: commandText },
    { id: "gridGuides", label: t("presentations.gridGuides.title"), execute: () => setGridDialog(true), group: commandText },
  ];

  const showMenuCommand = (id: string) => Boolean(selection.length ?
    ["copy", "cut", "paste", "duplicateSelection", "deleteSelection", "properties", "copyFormat", "pasteFormat", "front", "back", "forward", "backward", "shortcutHelp", "formatShape", "setDefault"].includes(id)
      || (id === "editPoints" && formatting.canEditPoints)
      || (id === "group" && selectedRoots.length >= 2) || (id === "ungroup" && selectedRoots.some(e => e.type === "frame" && e.content.isGroup))
      || (id === "editText" && isTextHost(selected)) || (id === "lock" && selection.some(e => !e.locked)) || (id === "unlock" && selection.some(e => e.locked))
      || (id.startsWith("align-") && selectedRoots.length >= 2) || (id === "connect" && !arrangementDisabled && selectedRoots.length === 2)
      || (id === "detach" && selected?.type === "shape" && selected.content.connection)
      || (id === "openDetail" && selection.length === 1) || (id === "removeDetail" && Boolean(selected && detail.frameByBox.has(selected.id)))
    : (detail.sceneId && (id === "closeDetail" || id === "importWiki")) || ["addText", "addFrame", "addShape", "addChart", "addIcon", "addImage", "paste", "selectAll", "overview", "toggleRuler", "toggleGrid", "toggleGuides", "gridGuides", "shortcutHelp"].includes(id));

  return { commands, commandText, executeCommand, showMenuCommand };
}
