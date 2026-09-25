import { describe, expect, it } from "vitest";
import de from "../../../../messages/de.json";
import en from "../../../../messages/en.json";
import { canOpenSlashCommands, filterSlashCommands, MARKDOWN_SHORTCUT_HINTS, shouldShowSlashMenu, type SlashCommandSearchItem } from "./slash-commands";
import { WIKI_SHORTCUT_ACTIONS } from "./wiki-shortcuts";

const commands: SlashCommandSearchItem[] = [
  { id: "paragraph", group: "text", label: "Text", description: "Normaler Absatz", keywords: ["paragraph", "absatz"] },
  { id: "attachment", group: "wiki", label: "Anhang hinzufügen", description: "Datei an diese Seite anhängen", keywords: ["anhänge", "datei", "upload"] },
  { id: "comment", group: "wiki", label: "Kommentar hinzufügen", description: "Seitenkommentar schreiben", keywords: ["kommentare", "discussion"] },
];

describe("filterSlashCommands", () => {
  it("finds commands by localized aliases while preserving command order", () => {
    expect(filterSlashCommands(commands, "DATEI").map((command) => command.id)).toEqual(["attachment"]);
    expect(filterSlashCommands(commands, "anhange").map((command) => command.id)).toEqual(["attachment"]);
    expect(filterSlashCommands(commands, "").map((command) => command.id)).toEqual(["paragraph", "attachment", "comment"]);
    expect(filterSlashCommands(commands, "not-a-command")).toEqual([]);
  });
});


describe("canOpenSlashCommands", () => {
  it("opens at a block boundary or after whitespace, but not mid-word, in links, or in code", () => {
    expect(canOpenSlashCommands({ textBeforeSlash: "", inCodeBlock: false, inLink: false })).toBe(true);
    expect(canOpenSlashCommands({ textBeforeSlash: "Some text ", inCodeBlock: false, inLink: false })).toBe(true);
    expect(canOpenSlashCommands({ textBeforeSlash: "https:/", inCodeBlock: false, inLink: false })).toBe(false);
    expect(canOpenSlashCommands({ textBeforeSlash: "word", inCodeBlock: false, inLink: false })).toBe(false);
    expect(canOpenSlashCommands({ textBeforeSlash: "", inCodeBlock: true, inLink: false })).toBe(false);
    expect(canOpenSlashCommands({ textBeforeSlash: "", inCodeBlock: false, inLink: true })).toBe(false);
  });
});

describe("shouldShowSlashMenu", () => {
  it("stays open while the query matches or is still a single word", () => {
    expect(shouldShowSlashMenu("", 5)).toBe(true);
    expect(shouldShowSlashMenu("überschrift 2", 1)).toBe(true);
    expect(shouldShowSlashMenu("xyz", 0)).toBe(true);
    expect(shouldShowSlashMenu("usr/bin is", 0)).toBe(false);
  });
});

describe("MARKDOWN_SHORTCUT_HINTS", () => {
  it("only names existing commands and shows the typed syntax", () => {
    const knownIds = new Set<string>([...WIKI_SHORTCUT_ACTIONS, ...Object.keys(de.wiki.slash.commands)]);
    for (const id of Object.keys(MARKDOWN_SHORTCUT_HINTS)) expect(knownIds.has(id), id).toBe(true);
    expect(MARKDOWN_SHORTCUT_HINTS.heading1).toBe("# ");
    expect(MARKDOWN_SHORTCUT_HINTS.taskList).toBe("[ ] ");
  });

  it("has a table command in both languages", () => {
    expect(de.wiki.slash.commands.table.label).toBe("Tabelle");
    expect(en.wiki.slash.commands.table.label).toBe("Table");
    expect(Object.keys(de.wiki.slash.commands)).toEqual(Object.keys(en.wiki.slash.commands));
  });
});
