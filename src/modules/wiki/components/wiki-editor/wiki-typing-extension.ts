// Typing helpers of the wiki editor: Markdown shortcuts, their undo, and the "/" menu.
// TipTap's own input rules (headings, lists, task items, quotes, code blocks, dividers,
// bold/italic/strike/code) are enabled through `enableInputRules` in wiki-editor.tsx.
import { Extension } from "@tiptap/core";
import { MarkdownHighlightRules, MarkdownShortcuts } from "../markdown-shortcut-extension";
import { createSlashCommandExtension, type SlashCommandDefinition } from "../slash-command-menu";
import { MarkdownConversionUndo } from "./markdown-conversion-undo";

/**
 * Paste rules stay limited to inline marks: pasted block syntax ("# ", "- ") remains
 * literal. They run on local paste transactions only, never on remote Yjs updates.
 */
export const WIKI_PASTE_RULE_EXTENSIONS = ["bold", "italic", "strike", "code", "markdownHighlightRules"];

export function createWikiTypingExtension({ getSlashCommands, slashAriaLabel, slashEmptyLabel, currentUserId }: {
  getSlashCommands: () => SlashCommandDefinition[];
  slashAriaLabel: string;
  slashEmptyLabel: string;
  currentUserId: string;
}) {
  return Extension.create({
    name: "wikiTyping",
    addExtensions() {
      return [
        MarkdownShortcuts,
        MarkdownConversionUndo,
        MarkdownHighlightRules.configure({ createdBy: currentUserId }),
        createSlashCommandExtension({ getCommands: getSlashCommands, ariaLabel: slashAriaLabel, emptyLabel: slashEmptyLabel }),
      ];
    },
  });
}
