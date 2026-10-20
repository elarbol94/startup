"use client";
// Paragraph and character formatting the way PowerPoint applies it: to the selected
// paragraphs/characters while a text is being edited, otherwise to all text of the selected
// object. Used by the Format pane's text sections and the text toolbar.
import { useEffect, useReducer } from "react";
import type { Editor } from "@tiptap/react";
import { parseParagraphFormat } from "../../collaboration/rich-text";
import type { PresentationElement } from "../../lib/presentation";
import type { PresentationParagraph } from "../../lib/presentation-format-model";
import { effectiveParagraphs, lineCount, updateParagraphs } from "../../lib/presentation-paragraphs";

type TextHost = Extract<PresentationElement, { type: "text" | "shape" }>;
type Run = NonNullable<Extract<PresentationElement, { type: "text" }>["content"]["runs"]>[number];
export type RunPatch = Partial<Pick<Run, "bold" | "italic" | "underline" | "color" | "strike" | "baseline" | "highlight" | "spacing" | "size" | "caps">>;
export type TextFormatApi = {
  paragraph: PresentationParagraph; run: RunPatch;
  setParagraph: (update: (p: PresentationParagraph) => PresentationParagraph) => void;
  setRun: (patch: RunPatch) => void;
};

const MARKS: Record<keyof RunPatch, string> = { bold: "bold", italic: "italic", underline: "underline", color: "runColor", strike: "strike", baseline: "runBaseline", highlight: "runHighlight", spacing: "runSpacing", size: "runSize", caps: "runCaps" };

function applyRunPatch(run: Run, patch: RunPatch): Run {
  const next = { ...run, ...patch } as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) if (value === undefined || value === false) delete next[key];
  return next as Run;
}

/** Writes paragraph and run formats through the editor's transaction when one is editing the text. */
function editorApi(editor: Editor): TextFormatApi {
  const { $from } = editor.state.selection;
  const attrs = (name: string) => editor.getAttributes(name);
  const run: RunPatch = {
    bold: editor.isActive("bold"), italic: editor.isActive("italic"), underline: editor.isActive("underline"), color: attrs("runColor").color ?? undefined,
    strike: editor.isActive("runDoubleStrike") ? "double" : editor.isActive("strike") ? "single" : undefined,
    baseline: Number(attrs("runBaseline").value) || undefined, highlight: attrs("runHighlight").value ?? undefined,
    spacing: Number(attrs("runSpacing").value) || undefined, size: Number(attrs("runSize").value) || undefined, caps: attrs("runCaps").value ?? undefined,
  };
  return {
    paragraph: parseParagraphFormat($from.parent.attrs.format) ?? {}, run,
    setParagraph: (update) => {
      const { state, view } = editor, { $from: from, $to: to } = state.selection;
      let tr = state.tr;
      state.doc.nodesBetween(from.before(1), to.after(1), (node, pos) => {
        if (node.type.name !== "paragraph") return false;
        const next = update(parseParagraphFormat(node.attrs.format) ?? {});
        tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, format: Object.keys(next).length ? JSON.stringify(next) : null });
        return false;
      });
      view.dispatch(tr); view.focus();
    },
    setRun: (patch) => {
      let chain = editor.chain().focus();
      for (const [key, value] of Object.entries(patch) as [keyof RunPatch, RunPatch[keyof RunPatch]][]) {
        if (key === "strike") { chain = chain.unsetMark("strike").unsetMark("runDoubleStrike"); if (value === "single") chain = chain.setMark("strike"); if (value === "double") chain = chain.setMark("runDoubleStrike", { value: "double" }); continue; }
        const mark = MARKS[key];
        chain = chain.unsetMark(mark);
        if (value === undefined || value === false || value === "") continue;
        chain = value === true ? chain.setMark(mark) : chain.setMark(mark, mark === "runColor" ? { color: value } : { value: String(value) });
      }
      chain.run();
    },
  };
}

/** Re-renders when the inline editor's selection or content changes, so the caret's formats show. */
export function useEditorRefresh(editor: Editor | null) {
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.on("transaction", refresh);
    return () => { editor.off("transaction", refresh); };
  }, [editor]);
}

/** Several objects formatted together: read from the first, write to all. */
export function combineTextFormats(apis: TextFormatApi[]): TextFormatApi | null {
  if (!apis.length) return null;
  return { paragraph: apis[0].paragraph, run: apis[0].run, setParagraph: (u) => apis.forEach((api) => api.setParagraph(u)), setRun: (p) => apis.forEach((api) => api.setRun(p)) };
}

/**
 * The format API for one text host. `editor` is the inline editor when this element's text is
 * being edited; `update` writes the element (one undo step per call).
 */
export function textFormatFor(element: TextHost | null, editor: Editor | null, update: (id: string, change: (content: TextHost["content"]) => TextHost["content"]) => void): TextFormatApi | null {
  if (!element) return null;
  if (editor && !editor.isDestroyed) return editorApi(editor);
  const c = element.content, text = c.text ?? "", lines = lineCount(text);
  const legacyList = element.type === "text" ? element.content.list : undefined;
  const first = effectiveParagraphs(lines, c.paragraphs, legacyList)[0] ?? {};
  const runs = c.runs ?? [{ text }];
  const run = runs.find((r) => r.text.trim()) ?? runs[0] ?? { text: "" };
  return {
    paragraph: first,
    run: { bold: run.bold ?? (element.type === "text" ? element.content.bold : element.content.bold), italic: run.italic, underline: run.underline, color: run.color, strike: run.strike, baseline: run.baseline, highlight: run.highlight, spacing: run.spacing, size: run.size, caps: run.caps },
    setParagraph: (change) => update(element.id, (content) => {
      const all = effectiveParagraphs(lineCount(content.text ?? ""), content.paragraphs, "list" in content ? content.list : undefined);
      const paragraphs = updateParagraphs(all, all.length, all.keys(), change);
      return { ...content, paragraphs, ...("list" in content ? { list: undefined } : {}) };
    }),
    setRun: (patch) => update(element.id, (content) => content.text ? { ...content, runs: (content.runs ?? [{ text: content.text }]).map((r) => applyRunPatch(r, patch)) } : content),
  };
}
