// Figure insertion for the wiki editor: uploading, inserting, replacing and editing figure
// images and inserting the figure list. Used by wiki-editor.tsx.
import type { RefObject, Dispatch, SetStateAction } from "react";
import type { ChainedCommands } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import type { useTranslations } from "next-intl";
import { closeHistory } from "@tiptap/pm/history";
import type { DocumentSettingsV1 } from "../../lib/document-settings";
import type { FigureAssetDto } from "../../lib/figure-types";
import { addUpload, removeUpload, uploadPosition } from "../figure-upload";
import { figureAssetAttributes, type useFigureLibrary } from "../figure-library";
import { imageNodeAttrs, isInlineImageFile } from "./wiki-editor-document-ops";
import type { ExistingImageAttachment, UploadedAttachment } from "./wiki-editor-types";

export function createFigureHandlers({
  activeEditor, t, figureLibrary, uploadControllers, conflictBlocked, toolbarSelection, figureTargetId, documentSettings,
  setImageUploading, setImageError, setInlineImagePickerOpen, setPreferredSvgId, setGraphicsOpen, toolbarChain, changeDocumentSettings,
}: {
  activeEditor: Editor;
  t: ReturnType<typeof useTranslations<"wiki">>;
  figureLibrary: ReturnType<typeof useFigureLibrary>;
  uploadControllers: RefObject<Set<AbortController>>;
  conflictBlocked: RefObject<boolean>;
  toolbarSelection: RefObject<{ from: number; to: number } | null>;
  figureTargetId: string;
  documentSettings: DocumentSettingsV1;
  setImageUploading: Dispatch<SetStateAction<boolean>>;
  setImageError: Dispatch<SetStateAction<string>>;
  setInlineImagePickerOpen: Dispatch<SetStateAction<boolean>>;
  setPreferredSvgId: Dispatch<SetStateAction<string>>;
  setGraphicsOpen: Dispatch<SetStateAction<boolean>>;
  toolbarChain: () => ChainedCommands;
  changeDocumentSettings: (settings: DocumentSettingsV1) => void;
}) {
  async function insertInlineImage(file: File) {
    await insertFigureFiles([file], toolbarSelection.current?.from ?? activeEditor.state.selection.from, figureTargetId);
  }
  async function insertFigureFiles(files: File[], position: number, targetId = "") {
    if (!activeEditor.isEditable) return;
    const controller = new AbortController(); uploadControllers.current.add(controller);
    const id = crypto.randomUUID();
    const cancel = () => { controller.abort(); removeUpload(activeEditor, id); };
    addUpload(activeEditor, position, { id, label: t("figures.uploading"), cancelLabel: t("figures.cancel"), cancel });
    setImageUploading(true); setImageError(""); setInlineImagePickerOpen(false);
    try {
      for (const file of files) {
        if (!isInlineImageFile(file)) throw new Error(t("inlineImageUnsupported"));
        const form = new FormData(); form.set("file", file);
        const response = await figureLibrary.request(form, "POST", controller.signal);
        if (controller.signal.aborted || activeEditor.isDestroyed || !activeEditor.isEditable || conflictBlocked.current) break;
        const asset = response.assets.find((item) => item.id === response.result?.id);
        const at = uploadPosition(activeEditor, id);
        if (!asset || at === undefined) break;
        removeUpload(activeEditor, id);
        const attrs = { ...imageNodeAttrs({ id: asset.attachmentId, fileName: asset.fileName, mimeType: asset.mimeType }), ...figureAssetAttributes(asset) };
        let replaced = false;
        if (targetId) activeEditor.state.doc.descendants((node, pos) => { if (node.attrs.nodeId === targetId && node.type.name === "commentableImage") { activeEditor.view.dispatch(activeEditor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, assetId: asset.id, attachmentId: asset.attachmentId, src: asset.src })); replaced = true; } });
        if (!targetId) {
          activeEditor.chain().insertContentAt(at, { type: "commentableImage", attrs }).run();
          let nextPosition = at + 1;
          activeEditor.state.doc.descendants((node, pos) => { if (node.attrs.nodeId === attrs.nodeId) nextPosition = pos + node.nodeSize; });
          addUpload(activeEditor, nextPosition, { id, label: t("figures.uploading"), cancelLabel: t("figures.cancel"), cancel });
        } else if (!replaced) break;
      }
    } catch (error) { if (!controller.signal.aborted) setImageError(error instanceof Error && t.has(`figures.${error.message}`) ? t(`figures.${error.message}` as "figures.invalidFile") : t("uploadFailed")); }
    finally { removeUpload(activeEditor, id); if (!activeEditor.isDestroyed) activeEditor.view.dispatch(closeHistory(activeEditor.state.tr)); uploadControllers.current.delete(controller); setImageUploading(uploadControllers.current.size > 0); }
  }
  function insertFigureAsset(asset: FigureAssetDto) {
    if (figureTargetId) {
      activeEditor.state.doc.descendants((node, position) => {
        if (node.attrs.nodeId === figureTargetId && node.type.name === "commentableImage") activeEditor.view.dispatch(activeEditor.state.tr.setNodeMarkup(position, undefined, { ...node.attrs, assetId: asset.id, attachmentId: asset.attachmentId, src: asset.src }));
      });
    } else toolbarChain().insertContent({ type: "commentableImage", attrs: { ...imageNodeAttrs({ id: asset.attachmentId, fileName: asset.fileName, mimeType: asset.mimeType }), ...figureAssetAttributes(asset) } }).run();
  }
  async function editFigureArtwork(nodeId: string) {
    const node = (() => { let found: typeof activeEditor.state.doc | undefined; activeEditor.state.doc.descendants((item) => { if (item.attrs.nodeId === nodeId) found = item; }); return found; })();
    const asset = figureLibrary.manifest.assets.find((item) => item.id === node?.attrs.assetId);
    if (!asset || !activeEditor.isEditable) return;
    try {
      const { result: copy } = await figureLibrary.request({ action: "editableCopy", assetId: asset.id, expectedVersion: asset.version });
      if (!copy?.attachmentId || !activeEditor.isEditable || conflictBlocked.current) return;
      activeEditor.state.doc.descendants((item, position) => {
        if (item.attrs.nodeId === nodeId && item.attrs.assetId === asset.id) activeEditor.view.dispatch(activeEditor.state.tr.setNodeMarkup(position, undefined, { ...item.attrs, assetId: "", attachmentId: copy.attachmentId, src: copy.contentUrl }));
      });
      setPreferredSvgId(copy.id); setGraphicsOpen(true);
    } catch { setImageError(t("figures.sourceUnavailable")); }
  }
  function insertFigureList() {
    let existing: number | undefined;
    activeEditor.state.doc.descendants((node, pos) => { if (node.type.name === "figureList") existing = pos; });
    if (existing !== undefined) { (activeEditor.view.nodeDOM(existing) as HTMLElement | null)?.scrollIntoView({ block: "center" }); return; }
    activeEditor.chain().focus().insertContentAt(toolbarSelection.current?.to ?? activeEditor.state.selection.to, { type: "figureList", attrs: { title: t("figures.list") } }).run();
    changeDocumentSettings({ ...documentSettings, figures: { ...documentSettings.figures, enabled: false } });
  }

  /**
   * Selects a just-inserted image so the caption dialog, which acts on the current
   * NodeSelection, targets it.
   */
  function selectImageNode(nodeId: string) {
    let position = -1;
    activeEditor.state.doc.descendants((node, pos) => {
      if (position >= 0) return false;
      if (node.type.name === "commentableImage" && node.attrs.nodeId === nodeId) position = pos;
      return undefined;
    });
    if (position < 0) return false;
    activeEditor.chain().focus().setNodeSelection(position).run();
    return true;
  }

  /**
   * Inserts an image and asks for its caption straight away. The caption otherwise
   * defaults to the file name, which is almost never what belongs under a figure.
   */
  function insertImageWithCaption(attachment: UploadedAttachment) {
    const attrs = imageNodeAttrs(attachment);
    toolbarChain().insertContent({ type: "commentableImage", attrs }).run();
    setInlineImagePickerOpen(false);
    selectImageNode(String(attrs.nodeId));
  }

  function insertExistingImage(attachment: ExistingImageAttachment) {
    if (figureTargetId) {
      activeEditor.state.doc.descendants((node, position) => { if (node.attrs.nodeId === figureTargetId) activeEditor.view.dispatch(activeEditor.state.tr.setNodeMarkup(position, undefined, { ...node.attrs, assetId: "", attachmentId: attachment.id, src: attachment.src || `/api/files/${attachment.id}` })); });
    } else insertImageWithCaption(attachment);
  }

  return { insertInlineImage, insertFigureFiles, insertFigureAsset, editFigureArtwork, insertFigureList, insertExistingImage };
}
