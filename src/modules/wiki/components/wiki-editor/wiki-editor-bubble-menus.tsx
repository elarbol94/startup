"use client";
// Floating selection menus of the wiki editor: text formatting/comment actions and, in document
// mode, markdown table editing. Used by wiki-editor.tsx.
import type { Dispatch, SetStateAction } from "react";
import { useTranslations } from "next-intl";
import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { NodeSelection } from "@tiptap/pm/state";
import { AlignCenter, AlignLeft, AlignRight, Bold, ClipboardCheck, Columns2, Highlighter, Italic, Link2, MessageSquareText, Minus, Rows3, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addMarkdownTableColumn, addMarkdownTableRow, deleteMarkdownTableColumn, deleteMarkdownTableRow, setMarkdownTableCellAlignment, toggleMarkdownTableHeader } from "../../lib/document-table";

export function WikiEditorBubbleMenus({ editor, documentMode, currentUserId, setLinkEditorRequest, prepareComment, requestWikiTask }: {
  editor: Editor;
  documentMode: boolean;
  currentUserId: string;
  setLinkEditorRequest: Dispatch<SetStateAction<number>>;
  prepareComment: () => void;
  requestWikiTask: (targetEditor: Editor) => void;
}) {
  const t = useTranslations("wiki");
  const tTasks = useTranslations("tasks");
  const activeEditor = editor;
  return <>
  <BubbleMenu editor={editor} pluginKey="wikiTextCommentMenu" options={{ strategy: "fixed", flip: true, shift: true, offset: 8 }} shouldShow={({ state }) => !state.selection.empty && !(state.selection instanceof NodeSelection)} className="z-40 flex items-center gap-1 rounded-lg border bg-background p-1 shadow-lg">
    <Button type="button" size="icon-sm" variant={activeEditor.isActive("bold") ? "secondary" : "ghost"} aria-label={t("editor.toolbar.bold")} onClick={() => activeEditor.chain().focus().toggleBold().run()}><Bold className="size-4" /></Button>
    <Button type="button" size="icon-sm" variant={activeEditor.isActive("italic") ? "secondary" : "ghost"} aria-label={t("editor.toolbar.italic")} onClick={() => activeEditor.chain().focus().toggleItalic().run()}><Italic className="size-4" /></Button>
    <Button type="button" size="icon-sm" variant={activeEditor.isActive("link") ? "secondary" : "ghost"} aria-label={t("editor.link.button")} onClick={() => setLinkEditorRequest((value) => value + 1)}><Link2 className="size-4" /></Button>
    <span className="mx-0.5 h-5 w-px bg-border" />
    <Button type="button" size="sm" variant={activeEditor.isActive("highlight") ? "secondary" : "ghost"} onClick={() => activeEditor.chain().focus().toggleMark("highlight", { createdBy: currentUserId }).run()}><Highlighter className="size-4" />{t("highlightSelection")}</Button>
    <Button type="button" size="sm" variant="ghost" onClick={prepareComment}><MessageSquareText className="size-4" />{t("commentSelection")}</Button>
    <Button type="button" size="sm" variant="ghost" onClick={() => requestWikiTask(activeEditor)}><ClipboardCheck className="size-4" />{tTasks("createTask")}</Button>
  </BubbleMenu>
  {documentMode && <BubbleMenu editor={editor} pluginKey="wikiDocumentTableMenu" options={{ strategy: "fixed", placement: "bottom", flip: true, shift: true, offset: 8 }} shouldShow={() => activeEditor.isActive("markdownTable")} className="z-40 flex flex-wrap items-center gap-1 rounded-lg border bg-background p-1 shadow-lg">
    <Button type="button" size="sm" variant="ghost" onClick={() => addMarkdownTableRow(activeEditor)}><Rows3 />{t("document.table.addRow")}</Button>
    <Button type="button" size="sm" variant="ghost" onClick={() => addMarkdownTableColumn(activeEditor)}><Columns2 />{t("document.table.addColumn")}</Button>
    <Button type="button" size="sm" variant="ghost" onClick={() => toggleMarkdownTableHeader(activeEditor)}>{t("document.table.header")}</Button>
    <Button type="button" size="icon-sm" variant="ghost" aria-label={t("document.image.alignLeft")} onClick={() => setMarkdownTableCellAlignment(activeEditor, "left")}><AlignLeft /></Button>
    <Button type="button" size="icon-sm" variant="ghost" aria-label={t("document.image.alignCenter")} onClick={() => setMarkdownTableCellAlignment(activeEditor, "center")}><AlignCenter /></Button>
    <Button type="button" size="icon-sm" variant="ghost" aria-label={t("document.image.alignRight")} onClick={() => setMarkdownTableCellAlignment(activeEditor, "right")}><AlignRight /></Button>
    <Button type="button" size="icon-sm" variant="ghost" aria-label={t("document.table.deleteRow")} onClick={() => deleteMarkdownTableRow(activeEditor)}><Trash2 /></Button>
    <Button type="button" size="icon-sm" variant="ghost" aria-label={t("document.table.deleteColumn")} onClick={() => deleteMarkdownTableColumn(activeEditor)}><Minus /></Button>
  </BubbleMenu>}
  </>;
}
