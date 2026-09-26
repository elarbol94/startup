import { getSchema, Mark } from "@tiptap/core";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { EditorState, Plugin, TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import {
  MarkdownDocumentExtensions,
  MarkdownShortcutMarks,
} from "../components/markdown-shortcut-extension";
import { headingIdentityPlugin } from "../components/heading-identity";
import {
  markdownConversionUndoPlugin,
  markdownConversionUndoTransaction,
  markMarkdownConversion,
} from "../components/wiki-editor/markdown-conversion-undo";
import {
  applyMarkdownShortcut,
  findMarkdownShortcutAtSelection,
  matchMarkdownShortcut,
  type MarkdownShortcutBoundary,
  type MarkdownShortcutMark,
} from "./markdown-shortcuts";

const TestHighlight = Mark.create({
  name: "highlight",
  parseHTML: () => [{ tag: "mark" }],
  renderHTML: () => ["mark", 0],
});

const schema = getSchema([
  StarterKit.configure({ bold: false, code: false, italic: false, strike: false }),
  ...MarkdownShortcutMarks,
  ...MarkdownDocumentExtensions,
  TestHighlight,
  TaskList,
  TaskItem,
]);

const conversionCases: Array<{
  input: string;
  mark: MarkdownShortcutMark;
  text: string;
  markedText: string;
}> = [
  { input: "**bold**", mark: "bold", text: "bold", markedText: "bold" },
  { input: "*italic*", mark: "italic", text: "italic", markedText: "italic" },
  { input: "`const value = 1`", mark: "code", text: "const value = 1", markedText: "const value = 1" },
  { input: "[OpenAI](https://openai.com)", mark: "link", text: "OpenAI", markedText: "OpenAI" },
  { input: "~~gone~~", mark: "strike", text: "gone", markedText: "gone" },
  { input: "==important==", mark: "highlight", text: "important", markedText: "important" },
  { input: "H~2~O", mark: "subscript", text: "H2O", markedText: "2" },
  { input: "X^2^", mark: "superscript", text: "X2", markedText: "2" },
];

function transactionFor(input: string, mark?: MarkdownShortcutMark, nodeType = "paragraph") {
  const marks = mark ? [schema.marks[mark].create()] : undefined;
  const text = schema.text(input, marks);
  const doc = schema.node("doc", null, [schema.node(nodeType, null, [text])]);
  const selection = TextSelection.create(doc, input.length + 1);
  return EditorState.create({ schema, doc, selection }).tr;
}

function markedText(transaction: ReturnType<typeof transactionFor>, markName: string) {
  let value = "";
  transaction.doc.descendants((node) => {
    if (node.isText && node.marks.some((mark) => mark.type.name === markName)) value += node.text ?? "";
  });
  return value;
}

describe("matchMarkdownShortcut", () => {
  it.each(conversionCases)("$input becomes $mark", ({ input, mark, markedText }) => {
    expect(matchMarkdownShortcut(`Before ${input}`)).toMatchObject({
      kind: "mark",
      mark,
      text: markedText,
    });
  });

  it("matches emoji and footnote references", () => {
    expect(matchMarkdownShortcut("Funny :joy:")).toMatchObject({
      kind: "text",
      replacement: "😂",
    });
    expect(matchMarkdownShortcut("Sentence [^1]")).toMatchObject({
      kind: "node",
      node: "footnoteReference",
      attributes: { label: "1" },
    });
  });

  it.each([
    ["->", "→"],
    ["<-", "←"],
    ["-->", "⟶"],
    ["<->", "↔"],
  ])("matches the Markdown arrow %s", (input, replacement) => {
    expect(matchMarkdownShortcut(`Direction ${input}`)).toMatchObject({ kind: "text", replacement });
  });

  it.each([
    "**unfinished",
    "* spaced *",
    String.raw`\**escaped**`,
    "joined**bold**",
    "**line\nbreak**",
    "***",
    "```",
    "~~~",
    "====",
    "__not-in-the-request__",
    "_not-in-the-request_",
    "[unsafe](javascript:alert)",
    "[missing URL]()",
    ":unknown_emoji:",
  ])("ignores unsupported, malformed, or unsafe input: %s", (input) => {
    expect(matchMarkdownShortcut(input)).toBeNull();
  });
});

describe("applyMarkdownShortcut", () => {
  it.each(
    conversionCases.flatMap((item) =>
      (["space", "enter"] as MarkdownShortcutBoundary[]).map((boundary) => ({ ...item, boundary })),
    ),
  )("converts $input on $boundary", ({ input, mark, text, markedText: expectedMarkedText, boundary }) => {
    const transaction = transactionFor(input);
    expect(applyMarkdownShortcut(transaction, boundary)).toBe(true);
    expect(transaction.doc.firstChild?.textContent).toBe(text + (boundary === "space" ? " " : ""));
    expect(markedText(transaction, mark)).toBe(expectedMarkedText);
    if (boundary === "enter") expect(transaction.doc.childCount).toBe(2);
  });

  it("keeps the following word outside the converted mark", () => {
    const transaction = transactionFor("Before **bold**");
    expect(applyMarkdownShortcut(transaction, "space")).toBe(true);
    const paragraph = transaction.doc.firstChild!;
    expect(paragraph.textContent).toBe("Before bold ");
    expect(markedText(transaction, "bold")).toBe("bold");
    expect(paragraph.lastChild?.marks).toHaveLength(0);
  });

  it("creates a validated link mark", () => {
    const transaction = transactionFor("[OpenAI](https://openai.com)");
    expect(applyMarkdownShortcut(transaction, "space")).toBe(true);
    expect(transaction.doc.firstChild?.firstChild?.marks[0].attrs.href).toBe("https://openai.com");
  });

  it("replaces emoji and creates a footnote reference", () => {
    const emoji = transactionFor(":joy:");
    expect(applyMarkdownShortcut(emoji, "space")).toBe(true);
    expect(emoji.doc.firstChild?.textContent).toBe("😂 ");

    const footnote = transactionFor("[^note]");
    expect(applyMarkdownShortcut(footnote, "space")).toBe(true);
    expect(footnote.doc.firstChild?.firstChild?.type.name).toBe("footnoteReference");
    expect(footnote.doc.firstChild?.firstChild?.attrs.label).toBe("note");
  });

  it.each([
    ["->", "→"],
    ["<-", "←"],
    ["-->", "⟶"],
    ["<->", "↔"],
  ])("replaces arrow %s on both boundaries", (input, replacement) => {
    for (const boundary of ["space", "enter"] as MarkdownShortcutBoundary[]) {
      const transaction = transactionFor(input);
      expect(applyMarkdownShortcut(transaction, boundary)).toBe(true);
      expect(transaction.doc.firstChild?.textContent).toBe(replacement + (boundary === "space" ? " " : ""));
    }
  });

  it("does not convert inside code blocks or over existing formatting", () => {
    const codeTransaction = transactionFor("**bold**", undefined, "codeBlock");
    const markedTransaction = transactionFor("**bold**", "italic");
    expect(findMarkdownShortcutAtSelection(codeTransaction)).toBeNull();
    expect(findMarkdownShortcutAtSelection(markedTransaction)).toBeNull();
  });

  it.each([
    ["bulletList", "listItem"],
    ["taskList", "taskItem"],
  ])("splits a converted expression into a new %s item on Enter", (listName, itemName) => {
    const input = "*line*";
    const paragraph = schema.node("paragraph", null, [schema.text(input)]);
    const item = schema.node(itemName, itemName === "taskItem" ? { checked: false } : null, [paragraph]);
    const doc = schema.node("doc", null, [schema.node(listName, null, [item])]);
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, input.length + 3),
    });
    const transaction = state.tr;

    expect(applyMarkdownShortcut(transaction, "enter")).toBe(true);
    const list = transaction.doc.firstChild!;
    expect(list.childCount).toBe(2);
    expect(list.child(0).textContent).toBe("line");
    expect(markedText(transaction, "italic")).toBe("line");
    expect(list.child(1).textContent).toBe("");
  });
});

describe("markdown conversion undo", () => {
  // Stands in for TipTap's input-rules plugin, which marks its transactions this way.
  const inputRules = new Plugin({ isInputRules: true } as never);
  const plugins = [inputRules, markdownConversionUndoPlugin(), headingIdentityPlugin()];

  function stateWith(text: string) {
    const doc = schema.node("doc", null, [schema.node("paragraph", null, text ? [schema.text(text)] : [])]);
    return EditorState.create({ schema, doc, plugins, selection: TextSelection.create(doc, text.length + 1) });
  }

  function convertHeading() {
    // What the "# " input rule does: drop the "#" and turn the paragraph into a heading.
    const state = stateWith("#");
    const transaction = state.tr.delete(1, 2).setBlockType(1, 1, schema.nodes.heading, { level: 1 });
    transaction.setMeta(inputRules, { transform: transaction, from: 2, to: 2, text: " " });
    return state.apply(transaction);
  }

  it("restores the literal text even after appended transactions (heading ids)", () => {
    const converted = convertHeading();
    expect(converted.doc.firstChild?.type.name).toBe("heading");
    expect(converted.doc.firstChild?.attrs.id).toBeTruthy();

    const undo = markdownConversionUndoTransaction(converted);
    expect(undo).not.toBeNull();
    const restored = converted.apply(undo!);
    expect(restored.doc.firstChild?.type.name).toBe("paragraph");
    expect(restored.doc.firstChild?.textContent).toBe("# ");
    expect(restored.selection.from).toBe(3);
    expect(markdownConversionUndoTransaction(restored)).toBeNull();
  });

  it("forgets the conversion once the user keeps typing or moves the cursor", () => {
    const converted = convertHeading();
    expect(markdownConversionUndoTransaction(converted.apply(converted.tr.insertText("x")))).toBeNull();
    expect(markdownConversionUndoTransaction(converted.apply(converted.tr.setSelection(TextSelection.create(converted.doc, 1))))).toBeNull();
  });

  it("restores a Space-triggered shortcut including the typed space", () => {
    const input = "[Docs](https://example.com)";
    const state = stateWith(input);
    const transaction = state.tr;
    const from = transaction.selection.from;
    expect(applyMarkdownShortcut(transaction, "space")).toBe(true);
    markMarkdownConversion(transaction, { from, to: from, text: " " });
    const converted = state.apply(transaction);
    expect(converted.doc.firstChild?.textContent).toBe("Docs ");

    const restored = converted.apply(markdownConversionUndoTransaction(converted)!);
    expect(restored.doc.firstChild?.textContent).toBe(`${input} `);
    expect(markedText(restored.tr, "link")).toBe("");
  });

  it("has nothing to undo without a conversion", () => {
    const state = stateWith("plain");
    expect(markdownConversionUndoTransaction(state.apply(state.tr.insertText("!")))).toBeNull();
  });
});
