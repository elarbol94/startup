// Editor command definitions shared by the "/" menu, the command search and keyboard
// shortcuts of the wiki editor - the single source of truth for both menus. Used by wiki-editor.tsx.
import type { Dispatch, SetStateAction } from "react";
import type { Editor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import type { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlignLeft, BookMarked, CalendarClock, ClipboardCheck, Code, Columns2, Heading1, Heading2, Heading3, Highlighter, ImagePlus, Link2, List, ListOrdered, ListTodo, ListTree, MessageSquareText, Minus, Paperclip, Quote, ScissorsLineDashed, Table, Workflow } from "lucide-react";
import type { SlashCommandDefinition } from "../slash-command-menu";
import type { EditorSearchCommand } from "../editor-command-search";
import type { DocumentTool } from "../document-workspace";
import { MERMAID_PLACEHOLDER } from "../mermaid-extension";
import { undoMarkdownConversion } from "./markdown-conversion-undo";
import { recentEditorCommands } from "../../lib/command-search";
import { MARKDOWN_SHORTCUT_HINTS } from "../../lib/slash-commands";
import { readEditorStorage } from "../../lib/editor-draft";
import { exportSavedDocument } from "../../lib/editor-export";
import { proposalSectionSnippet, proposalTable } from "../../lib/proposal";
import type { ProofingLanguage } from "../../lib/spellcheck";
import { addMarkdownTableColumn, addMarkdownTableRow, deleteMarkdownTableColumn, deleteMarkdownTableRow, setMarkdownTableCellAlignment, toggleMarkdownTableHeader } from "../../lib/document-table";
import { WIKI_SHORTCUT_ACTIONS, type WikiShortcutAction } from "../../lib/wiki-shortcuts";
import type { WikiEditorPageActions } from "./wiki-editor-types";

type WikiTranslator = ReturnType<typeof useTranslations<"wiki">>;
type SetFlag = Dispatch<SetStateAction<boolean>>;
type BumpRequest = Dispatch<SetStateAction<number>>;

/** The slash menu's commands; the command search reuses their keywords. */
export function buildSlashCommands({
  t, pageActions, setPageLinkOpen, setLinkEditorRequest, setCitationOpen, setEvidenceOpen, setCommentsVisible,
  setCommentFocusRequest, setFigureReferenceOpen, requestWikiTask, requestWikiDeadline, openInlineImagePicker, rememberToolbarSelection,
}: {
  t: WikiTranslator;
  pageActions: WikiEditorPageActions;
  setPageLinkOpen: SetFlag;
  setLinkEditorRequest: BumpRequest;
  setCitationOpen: SetFlag;
  setEvidenceOpen: SetFlag;
  setCommentsVisible: (value: SetStateAction<boolean>) => void;
  setCommentFocusRequest: BumpRequest;
  setFigureReferenceOpen: SetFlag;
  requestWikiTask: (targetEditor: Editor) => void;
  requestWikiDeadline: (targetEditor: Editor) => void;
  openInlineImagePicker: () => void;
  rememberToolbarSelection: () => void;
}): SlashCommandDefinition[] {
  const group = (name: "text" | "lists" | "blocks" | "wiki") => t("slash.groups." + name);
  const slash = (id: string, groupName: "text" | "lists" | "blocks" | "wiki", icon: SlashCommandDefinition["icon"], execute: SlashCommandDefinition["execute"]): SlashCommandDefinition => ({ id, group: groupName, groupLabel: group(groupName), icon, execute, label: t("slash.commands." + id + ".label"), description: t("slash.commands." + id + ".description"), keywords: t.raw("slash.commands." + id + ".keywords") as string[], markdownHint: MARKDOWN_SHORTCUT_HINTS[id] });
  const slashCommands: SlashCommandDefinition[] = [
    slash("paragraph", "text", AlignLeft, (editor) => editor.chain().focus().setParagraph().run()),
    slash("heading1", "text", Heading1, (editor) => editor.chain().focus().setHeading({ level: 1 }).run()),
    slash("heading2", "text", Heading2, (editor) => editor.chain().focus().setHeading({ level: 2 }).run()),
    slash("heading3", "text", Heading3, (editor) => editor.chain().focus().setHeading({ level: 3 }).run()),
    slash("bulletList", "lists", List, (editor) => editor.chain().focus().toggleBulletList().run()),
    slash("orderedList", "lists", ListOrdered, (editor) => editor.chain().focus().toggleOrderedList().run()),
    slash("taskList", "lists", ListTodo, (editor) => editor.chain().focus().toggleTaskList().run()),
    slash("blockquote", "blocks", Quote, (editor) => editor.chain().focus().toggleBlockquote().run()),
    slash("codeBlock", "blocks", Code, (editor) => editor.chain().focus().toggleCodeBlock().run()),
    slash("table", "blocks", Table, (editor) => insertEmptyTable(editor)),
    slash("horizontalRule", "blocks", Minus, (editor) => editor.chain().focus().setHorizontalRule().run()),
    slash("pageBreak", "blocks", ScissorsLineDashed, (editor) => editor.chain().focus().insertContent({ type: "pageBreak" }).run()),
    slash("tableOfContents", "blocks", ListTree, (editor) => editor.chain().focus().insertContent({ type: "tableOfContents", attrs: { title: t("document.contents"), maxLevel: 3 } }).run()),
    slash("twoColumns", "blocks", Columns2, (editor) => editor.chain().focus().insertContent({ type: "layoutSection", attrs: { columns: 2, gapMm: 8 }, content: [{ type: "paragraph" }, { type: "paragraph" }] }).run()),
    slash("pageLink", "wiki", Link2, () => setPageLinkOpen(true)),
    slash("todo", "wiki", ClipboardCheck, (editor) => requestWikiTask(editor)),
    slash("deadline", "wiki", CalendarClock, (editor) => requestWikiDeadline(editor)),
    slash("externalLink", "wiki", Link2, () => setLinkEditorRequest((value) => value + 1)),
    slash("citation", "wiki", BookMarked, () => setCitationOpen(true)),
    slash("pdfEvidence", "wiki", Highlighter, () => setEvidenceOpen(true)),
    slash("inlineImage", "wiki", ImagePlus, () => openInlineImagePicker()),
    slash("mermaidDiagram", "wiki", Workflow, (editor) => {
      editor.chain().focus().insertContent({ type: "mermaidDiagram", attrs: { code: MERMAID_PLACEHOLDER, svg: "" } }).run();
    }),
    slash("attachment", "wiki", Paperclip, () => pageActions.addAttachment()),
    slash("supportingSource", "wiki", BookMarked, () => pageActions.linkSupportingSource()),
    slash("pageComment", "wiki", MessageSquareText, () => {
      setCommentsVisible(true);
      setCommentFocusRequest((value) => value + 1);
    }),
    // The document layout panel's Content tab already has a target picker covering
    // headings, figures, tables and annexes — open it rather than duplicating it here.
    slash("crossReference", "wiki", Link2, () => { rememberToolbarSelection(); setFigureReferenceOpen(true); }),
  ];
  return slashCommands;
}

/** Inserts an empty 3×3 table (header row plus two rows) and puts the cursor in its first cell. */
function insertEmptyTable(editor: Editor) {
  const table = proposalTable("generic", [["", "", ""], ["", "", ""], ["", "", ""]]);
  const tableId = String(table.attrs?.tableId);
  return editor.chain().focus().insertContent(table as never).command(({ tr }) => {
    let cell = -1;
    tr.doc.descendants((node, position) => {
      if (cell >= 0) return false;
      if (node.type.name === "markdownTable" && node.attrs.tableId === tableId) cell = position + 3;
      return true;
    });
    // markdownTable > markdownTableRow > markdownTableHeader > paragraph: its content starts one level deeper.
    if (cell >= 0) tr.setSelection(TextSelection.create(tr.doc, cell + 1));
    return true;
  }).run();
}

/** Runs one configurable wiki shortcut action against the editor. */
export function runWikiEditorAction(action: WikiShortcutAction, {
  editor, t, currentUserId, documentMode, pageActions, changeSearchOpen, setOutlineOpen, prepareComment, setCommentsVisible,
  changeDocumentMode, setTypographyOpen, setShortcutsOpen, openInlineImagePicker, setPageLinkOpen, setLinkEditorRequest,
  setCitationOpen, setEvidenceOpen, prepareImageComment,
}: {
  editor: Editor | null;
  t: WikiTranslator;
  currentUserId: string;
  documentMode: boolean;
  pageActions: WikiEditorPageActions;
  changeSearchOpen: (open: boolean) => void;
  setOutlineOpen: (value: SetStateAction<boolean>) => void;
  prepareComment: () => void;
  setCommentsVisible: (value: SetStateAction<boolean>) => void;
  changeDocumentMode: (enabled: boolean) => void;
  setTypographyOpen: SetFlag;
  setShortcutsOpen: SetFlag;
  openInlineImagePicker: () => void;
  setPageLinkOpen: SetFlag;
  setLinkEditorRequest: BumpRequest;
  setCitationOpen: SetFlag;
  setEvidenceOpen: SetFlag;
  prepareImageComment: (mode: "whole" | "region") => void;
}) {
  if (!editor) return;
    const run = (command: () => boolean) => command();
    switch (action) {
      // Right after a Markdown auto-conversion, undo restores the typed Markdown first.
      case "undo": run(() => undoMarkdownConversion(editor) || editor.chain().focus().undo().run()); break;
      case "redo": run(() => editor.chain().focus().redo().run()); break;
      case "bold": run(() => editor.chain().focus().toggleBold().run()); break;
      case "italic": run(() => editor.chain().focus().toggleItalic().run()); break;
      case "underline": run(() => editor.chain().focus().toggleUnderline().run()); break;
      case "highlight": run(() => editor.chain().focus().toggleMark("highlight", { createdBy: currentUserId }).run()); break;
      case "strike": run(() => editor.chain().focus().toggleStrike().run()); break;
      case "inlineCode": run(() => editor.chain().focus().toggleCode().run()); break;
      case "heading1": run(() => editor.chain().focus().toggleHeading({ level: 1 }).run()); break;
      case "heading2": run(() => editor.chain().focus().toggleHeading({ level: 2 }).run()); break;
      case "heading3": run(() => editor.chain().focus().toggleHeading({ level: 3 }).run()); break;
      case "bulletList": run(() => editor.chain().focus().toggleBulletList().run()); break;
      case "orderedList": run(() => editor.chain().focus().toggleOrderedList().run()); break;
      case "taskList": run(() => editor.chain().focus().toggleTaskList().run()); break;
      case "blockquote": run(() => editor.chain().focus().toggleBlockquote().run()); break;
      case "codeBlock": run(() => editor.chain().focus().toggleCodeBlock().run()); break;
      case "horizontalRule": run(() => editor.chain().focus().setHorizontalRule().run()); break;
      case "pageBreak": run(() => editor.chain().focus().insertContent({ type: "pageBreak" }).run()); break;
      case "tableOfContents": run(() => editor.chain().focus().insertContent({ type: "tableOfContents", attrs: { title: t("document.contents"), maxLevel: 3 } }).run()); break;
      case "twoColumns": run(() => editor.chain().focus().insertContent({ type: "layoutSection", attrs: { columns: 2, gapMm: 8 }, content: [{ type: "paragraph" }, { type: "paragraph" }] }).run()); break;
      case "search": changeSearchOpen(true); break;
      case "outline": setOutlineOpen(true); break;
      case "inlineComment": prepareComment(); break;
      case "toggleComments": setCommentsVisible((value) => !value); break;
      case "documentMode": changeDocumentMode(!documentMode); break;
      case "typography": setTypographyOpen(true); break;
      case "shortcuts": setShortcutsOpen(true); break;
      case "image": openInlineImagePicker(); break;
      case "pageLink": setPageLinkOpen(true); break;
      case "externalLink": setLinkEditorRequest((value) => value + 1); break;
      case "citation": setCitationOpen(true); break;
      case "pdfEvidence": setEvidenceOpen(true); break;
      case "attachment": pageActions.addAttachment(); break;
      case "supportingSource": pageActions.linkSupportingSource(); break;
      case "imageHighlight": run(() => editor.chain().focus().toggleMark("highlight", { createdBy: currentUserId }).run()); break;
      case "imageComment": prepareImageComment("whole"); break;
      case "imageRegion": prepareImageComment("region"); break;
      case "imageWidth50": run(() => editor.chain().focus().updateAttributes("commentableImage", { widthPercent: 50 }).run()); break;
      case "imageWidth75": run(() => editor.chain().focus().updateAttributes("commentableImage", { widthPercent: 75 }).run()); break;
      case "imageWidth100": run(() => editor.chain().focus().updateAttributes("commentableImage", { widthPercent: 100 }).run()); break;
      case "imageAlignLeft": run(() => editor.chain().focus().updateAttributes("commentableImage", { alignment: "left" }).run()); break;
      case "imageAlignCenter": run(() => editor.chain().focus().updateAttributes("commentableImage", { alignment: "center" }).run()); break;
      case "imageAlignRight": run(() => editor.chain().focus().updateAttributes("commentableImage", { alignment: "right" }).run()); break;
      case "tableAddRow": addMarkdownTableRow(editor); break;
      case "tableAddColumn": addMarkdownTableColumn(editor); break;
      case "tableHeader": toggleMarkdownTableHeader(editor); break;
      case "tableAlignLeft": setMarkdownTableCellAlignment(editor, "left"); break;
      case "tableAlignCenter": setMarkdownTableCellAlignment(editor, "center"); break;
      case "tableAlignRight": setMarkdownTableCellAlignment(editor, "right"); break;
      case "tableDeleteRow": deleteMarkdownTableRow(editor); break;
      case "tableDeleteColumn": deleteMarkdownTableColumn(editor); break;
    }
}

/** Every command the double-Shift command search offers, with availability and ranking hints. */
export function buildWikiEditorCommands({
  t, activeEditor, slashCommands, shortcutLabel, executeEditorAction, insertFigureList, documentMode, changeDocumentMode, setPanel,
  setGraphicsOpen, suggesting, setSuggesting, suggestionCounts, resolveSuggestions, proofingPicky, toggleProofingPicky, nextProofingIssue,
  proofingRetry, changeProofingLanguage, pageId, flushSave, setTypographyFocus, setTypographyOpen, setMarginFocusRequest, currentUserId,
}: {
  t: WikiTranslator;
  activeEditor: Editor;
  slashCommands: SlashCommandDefinition[];
  shortcutLabel: (action: WikiShortcutAction) => string;
  executeEditorAction: (action: WikiShortcutAction) => void;
  insertFigureList: () => void;
  documentMode: boolean;
  changeDocumentMode: (enabled: boolean) => void;
  setPanel: Dispatch<SetStateAction<DocumentTool>>;
  setGraphicsOpen: SetFlag;
  suggesting: boolean;
  setSuggesting: SetFlag;
  suggestionCounts: { inserted: number; deleted: number };
  resolveSuggestions: (accept: boolean) => void;
  proofingPicky: boolean;
  toggleProofingPicky: () => Promise<void>;
  nextProofingIssue: () => void;
  proofingRetry: { current: () => void };
  changeProofingLanguage: (next: ProofingLanguage) => Promise<void>;
  pageId: string;
  flushSave: () => Promise<boolean>;
  setTypographyFocus: Dispatch<SetStateAction<"bodySizePt" | "lineHeight" | undefined>>;
  setTypographyOpen: SetFlag;
  setMarginFocusRequest: BumpRequest;
  currentUserId: string;
}): EditorSearchCommand[] {
  const readOnlyActions = new Set(["search", "outline", "toggleComments", "typography", "shortcuts"]);
  const editorCommands: EditorSearchCommand[] = WIKI_SHORTCUT_ACTIONS.map((action) => ({
    id: action, label: t(`shortcuts.actions.${action}`), group: t("commandSearch.editor"), shortcut: shortcutLabel(action), markdownHint: MARKDOWN_SHORTCUT_HINTS[action],
    keywords: slashCommands.find((command) => command.id === action)?.keywords,
    disabledReason: !activeEditor.isEditable && !readOnlyActions.has(action) ? t("commandSearch.readOnly")
      : action.startsWith("image") && action !== "image" && !activeEditor.isActive("commentableImage") ? t("commandSearch.selectImage")
      : action.startsWith("table") && action !== "tableOfContents" && !activeEditor.isActive("markdownTable") ? t("commandSearch.selectTable")
      : action === "undo" && !activeEditor.can().undo() || action === "redo" && !activeEditor.can().redo() ? t("commandSearch.unavailable") : undefined,
    execute: () => executeEditorAction(action),
  }));
  for (const command of slashCommands) {
    if (editorCommands.some((item) => item.id === command.id) || command.id === "inlineImage") continue;
    editorCommands.push({ id: command.id, label: command.label, group: command.groupLabel, keywords: command.keywords, markdownHint: command.markdownHint,
      disabledReason: !activeEditor.isEditable ? t("commandSearch.readOnly") : undefined, execute: () => command.execute(activeEditor) });
  }
  editorCommands.push({ id: "figureList", label: t("figures.insertList"), group: t("commandSearch.tools"), execute: insertFigureList, disabledReason: !activeEditor.isEditable ? t("commandSearch.readOnly") : undefined });
  editorCommands.push({ id: "layout", label: t("document.panelTitle"), group: t("commandSearch.tools"), execute: () => { if (!documentMode) changeDocumentMode(true); setPanel("layout"); } });
  editorCommands.push({ id: "details", label: t("documentDetails"), group: t("commandSearch.tools"), execute: () => setPanel("details") });
  editorCommands.push({ id: "graphics", label: t("graphics.title"), group: t("commandSearch.tools"), execute: () => setGraphicsOpen(true), disabledReason: !activeEditor.isEditable ? t("commandSearch.readOnly") : undefined });
  editorCommands.push({ id: "suggestions", label: suggesting ? t("suggestions.leaveMode") : t("suggestions.enterMode"), group: t("commandSearch.tools"), execute: () => setSuggesting((value) => !value), disabledReason: !activeEditor.isEditable ? t("commandSearch.readOnly") : undefined });
  editorCommands.push({ id: "acceptSuggestions", label: t("suggestions.acceptAll", { count: suggestionCounts.inserted + suggestionCounts.deleted }), group: t("commandSearch.tools"), execute: () => resolveSuggestions(true), disabledReason: !activeEditor.isEditable ? t("commandSearch.readOnly") : undefined });
  editorCommands.push({ id: "rejectSuggestions", label: t("suggestions.rejectAll"), group: t("commandSearch.tools"), execute: () => resolveSuggestions(false), disabledReason: !activeEditor.isEditable ? t("commandSearch.readOnly") : undefined });
  editorCommands.push({ id: "proofingPicky", label: t("editor.proofing.picky"), group: t("commandSearch.tools"), execute: () => { void toggleProofingPicky(); }, disabledReason: !activeEditor.isEditable ? t("commandSearch.readOnly") : undefined });
  editorCommands.push({ id: "proofingNext", label: t("commandSearch.proofingNext"), group: t("commandSearch.tools"), execute: nextProofingIssue });
  editorCommands.push({ id: "proofingRetry", label: t("commandSearch.proofingRetry"), group: t("commandSearch.tools"), execute: () => proofingRetry.current() });
  for (const language of ["de-DE", "de-AT", "en-US"] as ProofingLanguage[]) {
    editorCommands.push({ id: `proofing-${language}`, label: t(`commandSearch.languages.${language}`), group: t("commandSearch.tools"), execute: () => { void changeProofingLanguage(language); }, disabledReason: !activeEditor.isEditable ? t("commandSearch.readOnly") : undefined });
  }
  // The plain table is the shared "table" command above.
  for (const kind of ["budget", "workPackages", "timeline", "risks", "kpis"] as const) {
    editorCommands.push({ id: `table-${kind}`, label: t(`document.proposal.${kind}`), group: t("commandSearch.tools"), execute: () => { activeEditor.chain().focus().insertContent(proposalTable(kind) as never).run(); }, disabledReason: !activeEditor.isEditable ? t("commandSearch.readOnly") : undefined });
  }
  for (const kind of ["executiveSummary", "objectives", "deliverables", "assumptions", "decision"] as const) {
    editorCommands.push({ id: `snippet-${kind}`, label: t(`document.proposal.snippet_${kind}`), group: t("commandSearch.tools"), execute: () => { activeEditor.chain().focus().insertContent(proposalSectionSnippet(kind) as never).run(); }, disabledReason: !activeEditor.isEditable ? t("commandSearch.readOnly") : undefined });
  }
  for (const attribute of ["keepWithNext", "keepTogether"] as const) {
    editorCommands.push({ id: attribute, label: t(`document.${attribute}`), group: t("commandSearch.tools"), execute: () => { activeEditor.chain().focus().updateAttributes(activeEditor.state.selection.$from.parent.type.name, { [attribute]: !activeEditor.isActive({ [attribute]: true }) }).run(); }, disabledReason: !activeEditor.isEditable ? t("commandSearch.readOnly") : undefined });
  }
  for (const format of ["pdf", "docx", "html"] as const) {
    editorCommands.push({ id: `export-${format}`, label: t("commandSearch.export", { format: format.toUpperCase() }), group: t("commandSearch.tools"), execute: () => { void exportSavedDocument(pageId, format, false, flushSave, () => toast.error(t("document.exportSaveFailed"))); } });
  }
  for (const [id, field, label] of [["fontSize", "bodySizePt", "bodySize"], ["lineSpacing", "lineHeight", "lineHeight"]] as const) {
    editorCommands.push({ id, label: t(`editor.preferences.controls.${label}`), group: t("commandSearch.tools"), keywords: t.raw(`commandSearch.aliases.${id}`) as string[], execute: () => { setTypographyFocus(field); setTypographyOpen(true); } });
  }
  editorCommands.push({ id: "pageMargins", label: t("commandSearch.pageMargins"), group: t("commandSearch.tools"), keywords: t.raw("commandSearch.aliases.pageMargins") as string[], execute: () => { if (!documentMode) changeDocumentMode(true); setPanel("layout"); setMarginFocusRequest((value) => value + 1); } });
  const recent = recentEditorCommands(readEditorStorage(`wiki-command-recent:${currentUserId}`));
  const marks: Record<string, string> = { bold: "bold", italic: "italic", underline: "underline", highlight: "highlight", strike: "strike", inlineCode: "code", bulletList: "bulletList", orderedList: "orderedList", taskList: "taskList", blockquote: "blockquote", codeBlock: "codeBlock" };
  for (const command of editorCommands) {
    if (marks[command.id]) command.active = activeEditor.isActive(marks[command.id]);
    if (/^heading[123]$/.test(command.id)) command.active = activeEditor.isActive("heading", { level: Number(command.id.at(-1)) });
    if (command.id === "suggestions") command.active = suggesting;
    if (command.id === "documentMode") command.active = documentMode;
    if (command.id === "proofingPicky") command.active = proofingPicky;
    if (t.has(`commandSearch.aliases.${command.id}`)) command.keywords = [...(command.keywords ?? []), ...(t.raw(`commandSearch.aliases.${command.id}`) as string[])];
    const recentIndex = recent.indexOf(command.id);
    if (recentIndex >= 0) command.recentIndex = recentIndex;
    if (!command.disabledReason) {
      if (activeEditor.isActive("commentableImage") && command.id.startsWith("image") && command.id !== "image") command.contextPriority = 3;
      else if (activeEditor.isActive("markdownTable") && command.id.startsWith("table") && command.id !== "tableOfContents" && !command.id.startsWith("table-")) command.contextPriority = 3;
      else if (!activeEditor.state.selection.empty && marks[command.id] && ["bold", "italic", "underline", "highlight", "strike", "inlineCode"].includes(command.id)) command.contextPriority = 2;
    }
  }
  return editorCommands;
}
