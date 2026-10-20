import { Extension, getSchema, Mark, type JSONContent } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";
import { presentationLinkSchema, type PresentationTextElement } from "../lib/presentation";
import { paragraphSchema, type PresentationParagraph } from "../lib/presentation-format-model";
import { effectiveParagraphs, paragraphMarkers, shiftLevel } from "../lib/presentation-paragraphs";
import { cssText, paragraphCss } from "../lib/presentation-text-style";

/** A mark carrying one attribute, rendered as a span with a data attribute and inline style. */
function valueMark(name: string, attr: string, style: (value: string) => string) {
  return Mark.create({
    name, addAttributes: () => ({ [attr]: { default: null } }),
    parseHTML: () => [{ tag: `span[data-${name}]`, getAttrs: (node) => ({ [attr]: (node as HTMLElement).getAttribute(`data-${name}`) }) }],
    renderHTML: ({ HTMLAttributes }) => ["span", { [`data-${name}`]: HTMLAttributes[attr], style: style(String(HTMLAttributes[attr])) }, 0],
  });
}
export const RunColor = Mark.create({ name: "runColor", addAttributes: () => ({ color: { default: null } }), parseHTML: () => [{ tag: "span[data-run-color]" }], renderHTML: ({ HTMLAttributes }) => ["span", { "data-run-color": HTMLAttributes.color, style: `color:${HTMLAttributes.color}` }, 0] });
// Character formatting from PowerPoint's Font dialog. Each is its own mark so that toggling one
// never replaces another (ProseMirror keeps one mark of a type per range).
export const RunDoubleStrike = valueMark("runDoubleStrike", "value", () => "text-decoration:line-through;text-decoration-style:double");
export const RunBaseline = valueMark("runBaseline", "value", (v) => `vertical-align:${Number(v) / 100 / 0.67}em;font-size:0.67em`);
export const RunHighlight = valueMark("runHighlight", "value", (v) => `background-color:${v}`);
export const RunSpacing = valueMark("runSpacing", "value", (v) => `letter-spacing:${Number(v)}px`);
export const RunSize = valueMark("runSize", "value", (v) => `font-size:${Number(v)}px`);
export const RunCaps = valueMark("runCaps", "value", (v) => v === "small" ? "font-variant:small-caps" : "text-transform:uppercase");

/** Paragraph format (list level, bullet, spacing...) as one JSON attribute, so Yjs keeps it with its line. */
export const ParagraphFormat = Extension.create({
  name: "paragraphFormat",
  addGlobalAttributes: () => [{
    types: ["paragraph"],
    attributes: { format: { default: null, parseHTML: (node) => node.getAttribute("data-format"), renderHTML: (attrs) => {
      if (!attrs.format) return {};
      const format = parseParagraphFormat(attrs.format);
      return { "data-format": attrs.format, ...(format ? { style: cssText(paragraphCss(effectiveParagraphs(1, [format], undefined)[0])) } : {}) };
    } } },
  }],
  addProseMirrorPlugins: () => [new Plugin({
    key: new PluginKey("paragraphMarkers"),
    // Bullets and numbers are not text: widgets at each paragraph's start, numbered like the rendered text.
    props: { decorations: (state) => {
      const formats: PresentationParagraph[] = [], starts: number[] = [];
      state.doc.forEach((node, offset) => { formats.push(parseParagraphFormat(node.attrs.format) ?? {}); starts.push(offset + 1); });
      const markers = paragraphMarkers(formats);
      return DecorationSet.create(state.doc, markers.flatMap((marker, i) => {
        if (!marker) return [];
        const hang = -(Number(paragraphCss(formats[i]).textIndent) || 0);
        return [Decoration.widget(starts[i], () => {
          const span = document.createElement("span");
          span.textContent = marker.text; span.contentEditable = "false"; span.setAttribute("aria-hidden", "true");
          Object.assign(span.style, { display: "inline-block", textIndent: "0", minWidth: hang ? `${hang}px` : "", paddingRight: hang ? "" : "0.3em", fontFamily: marker.font ?? "", userSelect: "none" });
          return span;
        }, { side: -1, key: `${i}:${marker.text}:${hang}` })];
      }));
    } },
  })],
  addKeyboardShortcuts() {
    // PowerPoint: Tab / Shift+Tab at the start of a list paragraph, or Alt+Shift+Right/Left anywhere, change its level.
    const shift = (delta: number, onlyAtListStart: boolean) => () => {
      const { state, view } = this.editor;
      const { $from, $to, empty } = state.selection;
      if (onlyAtListStart) {
        // A caret at the start of a list paragraph, or a selection touching list paragraphs
        // (PowerPoint demotes every selected one); anywhere else Tab stays a tab.
        const listed = (node: { attrs: Record<string, unknown> }) => { const f = parseParagraphFormat(node.attrs.format); return Boolean(f?.bullet && f.bullet.kind !== "none"); };
        let touched = false;
        state.doc.nodesBetween($from.before(1), $to.after(1), (node) => { if (node.type.name === "paragraph" && listed(node)) touched = true; return false; });
        if (!touched || (empty && $from.parentOffset !== 0)) return false;
      }
      let tr = state.tr;
      state.doc.nodesBetween($from.before(1), $to.after(1), (node, pos) => {
        if (node.type.name !== "paragraph") return false;
        const next = shiftLevel(parseParagraphFormat(node.attrs.format) ?? {}, delta);
        tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, format: formatAttr(next) });
        return false;
      });
      view.dispatch(tr);
      return true;
    };
    const baseline = (value: number) => () => {
      const active = this.editor.getAttributes("runBaseline").value === String(value);
      return this.editor.chain().focus().unsetMark("runBaseline").run() && (active || this.editor.chain().setMark("runBaseline", { value: String(value) }).run());
    };
    return {
      Tab: shift(1, true), "Shift-Tab": shift(-1, true), "Alt-Shift-ArrowRight": shift(1, false), "Alt-Shift-ArrowLeft": shift(-1, false),
      "Mod-Shift-=": baseline(30), "Mod-Shift-+": baseline(30), "Mod-=": baseline(-25),
    };
  },
});

export const richExtensions = () => [StarterKit.configure({ undoRedo: false, heading: false, codeBlock: false, blockquote: false, horizontalRule: false, bulletList: false, orderedList: false, listItem: false, link: { openOnClick: false } }), RunColor, RunDoubleStrike, RunBaseline, RunHighlight, RunSpacing, RunSize, RunCaps, ParagraphFormat];
export const richSchema = getSchema(richExtensions());
export type Content = PresentationTextElement["content"];
type Run = NonNullable<Content["runs"]>[number];

/** Parses a paragraph's stored format, dropping anything that is not a valid paragraph format. */
export function parseParagraphFormat(value: unknown): PresentationParagraph | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try { const parsed = paragraphSchema.safeParse(JSON.parse(value)); return parsed.success && Object.keys(parsed.data).length ? parsed.data : undefined; } catch { return undefined; }
}
const formatAttr = (p: PresentationParagraph | undefined) => p && Object.keys(p).length ? JSON.stringify(p) : null;

function runMarks(run: Run): JSONContent["marks"] {
  return [
    run.bold && { type: "bold" }, run.italic && { type: "italic" }, run.underline && { type: "underline" },
    run.strike === "single" && { type: "strike" }, run.strike === "double" && { type: "runDoubleStrike", attrs: { value: "double" } },
    run.color && { type: "runColor", attrs: { color: run.color } }, run.href && { type: "link", attrs: { href: run.href } },
    run.baseline && { type: "runBaseline", attrs: { value: String(run.baseline) } }, run.highlight && { type: "runHighlight", attrs: { value: run.highlight } },
    run.spacing && { type: "runSpacing", attrs: { value: String(run.spacing) } }, run.size && { type: "runSize", attrs: { value: String(run.size) } },
    run.caps && { type: "runCaps", attrs: { value: run.caps } },
  ].filter(Boolean) as JSONContent["marks"];
}

export function toDoc(content: Pick<Content, "text" | "runs" | "paragraphs">): JSONContent {
  const paragraph = (index: number): JSONContent => ({ type: "paragraph", ...(formatAttr(content.paragraphs?.[index]) ? { attrs: { format: formatAttr(content.paragraphs?.[index]) } } : {}), content: [] });
  const paragraphs: JSONContent[] = [paragraph(0)];
  for (const run of content.runs ?? [{ text: content.text }]) {
    run.text.split("\n").forEach((text, index) => {
      if (index) paragraphs.push(paragraph(paragraphs.length));
      if (!text) return;
      const marks = runMarks(run);
      paragraphs[paragraphs.length - 1].content!.push({ type: "text", text, ...(marks?.length ? { marks } : { marks: [] }) });
    });
  }
  return { type: "doc", content: paragraphs };
}

export function fromDoc(doc: JSONContent): Pick<Content, "text" | "runs" | "paragraphs"> {
  const runs: NonNullable<Content["runs"]> = [];
  const paragraphs: PresentationParagraph[] = [];
  doc.content?.forEach((paragraph, index) => {
    if (index) runs.push({ text: "\n" });
    paragraphs.push(parseParagraphFormat(paragraph.attrs?.format) ?? {});
    for (const node of paragraph.content ?? []) {
      if (node.type === "hardBreak") { runs.push({ text: "\n" }); paragraphs.push({ ...paragraphs[paragraphs.length - 1] }); continue; }
      const mark = (type: string) => node.marks?.find((m) => m.type === type)?.attrs;
      const href = mark("link")?.href;
      const run: Run = { text: node.text ?? "", color: mark("runColor")?.color, bold: node.marks?.some((m) => m.type === "bold"), italic: node.marks?.some((m) => m.type === "italic"), underline: node.marks?.some((m) => m.type === "underline"), href: typeof href === "string" && presentationLinkSchema.safeParse(href).success ? href : undefined };
      // Only fields that are set, so runs saved before these options existed compare equal.
      const strike = mark("runDoubleStrike") ? "double" : node.marks?.some((m) => m.type === "strike") ? "single" : undefined;
      const baseline = Number(mark("runBaseline")?.value), spacing = Number(mark("runSpacing")?.value), size = Number(mark("runSize")?.value);
      const highlight = mark("runHighlight")?.value, caps = mark("runCaps")?.value;
      if (strike) run.strike = strike;
      if (baseline) run.baseline = Math.max(-100, Math.min(100, baseline));
      if (typeof highlight === "string" && highlight.length <= 32) run.highlight = highlight;
      if (spacing) run.spacing = Math.max(-100, Math.min(1584, spacing));
      if (size > 0) run.size = Math.min(400, size);
      if (caps === "all" || caps === "small") run.caps = caps;
      runs.push(run);
    }
  });
  const formatted = paragraphs.some((p) => Object.keys(p).length);
  // An explicit undefined, so merging this into content clears formats that were removed.
  return { text: runs.map((run) => run.text).join(""), runs, paragraphs: formatted ? paragraphs : undefined };
}
