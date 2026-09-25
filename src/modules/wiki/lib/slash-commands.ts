export type SlashCommandSearchItem = {
  id: string;
  group: string;
  label: string;
  description: string;
  keywords: string[];
  /** Markdown that produces the same result while typing, e.g. "# ". */
  markdownHint?: string;
};

export type SlashCommandContext = {
  textBeforeSlash: string;
  inCodeBlock: boolean;
  inLink: boolean;
};

export function canOpenSlashCommands({ textBeforeSlash, inCodeBlock, inLink }: SlashCommandContext) {
  if (inCodeBlock || inLink) return false;
  return textBeforeSlash.length === 0 || /\s$/.test(textBeforeSlash);
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();
}

export function filterSlashCommands<T extends SlashCommandSearchItem>(commands: T[], query: string): T[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return commands;
  return commands.filter((command) =>
    normalizeSearchText([command.label, command.description, ...command.keywords].join(" ")).includes(normalizedQuery),
  );
}

/**
 * Markdown typed at the start of a paragraph (blocks) or around text (marks) that the
 * editor converts while typing. Keyed by slash-command / shortcut-action id so the slash
 * menu and the command search can show the syntax next to the matching command.
 */
export const MARKDOWN_SHORTCUT_HINTS: Readonly<Record<string, string>> = {
  heading1: "# ",
  heading2: "## ",
  heading3: "### ",
  bulletList: "- ",
  orderedList: "1. ",
  taskList: "[ ] ",
  blockquote: "> ",
  codeBlock: "```",
  horizontalRule: "---",
  bold: "**…**",
  italic: "*…*",
  strike: "~~…~~",
  inlineCode: "`…`",
  highlight: "==…==",
};

/** Keeps the menu out of the way once "/" turns out to be ordinary text ("/usr/bin is …"). */
export function shouldShowSlashMenu(query: string, matchCount: number) {
  return matchCount > 0 || !/\s/.test(query);
}
