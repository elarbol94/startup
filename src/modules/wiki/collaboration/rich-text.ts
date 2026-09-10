import { getSchema, Mark, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { presentationLinkSchema, type PresentationTextElement } from "../lib/presentation";
export const RunColor = Mark.create({ name: "runColor", addAttributes: () => ({ color: { default: null } }), parseHTML: () => [{ tag: "span[data-run-color]" }], renderHTML: ({ HTMLAttributes }) => ["span", { "data-run-color": HTMLAttributes.color, style: `color:${HTMLAttributes.color}` }, 0] });
export const richExtensions = () => [StarterKit.configure({ undoRedo: false, heading: false, codeBlock: false, blockquote: false, horizontalRule: false, bulletList: false, orderedList: false, listItem: false, link: { openOnClick: false } }), RunColor];
export const richSchema = getSchema(richExtensions());
export type Content = PresentationTextElement["content"];
export function toDoc(content: Content): JSONContent {
  const paragraphs: JSONContent[] = [{ type: "paragraph", content: [] }];
  for (const run of content.runs ?? [{ text: content.text }]) {
    run.text.split("\n").forEach((text, index) => {
      if (index) paragraphs.push({ type: "paragraph", content: [] });
      if (!text) return;
      const marks = [run.bold && { type: "bold" }, run.italic && { type: "italic" }, run.underline && { type: "underline" }, run.color && { type: "runColor", attrs: { color: run.color } }, run.href && { type: "link", attrs: { href: run.href } }].filter(Boolean) as JSONContent["marks"];
      paragraphs[paragraphs.length - 1].content!.push({ type: "text", text, marks });
    });
  }
  return { type: "doc", content: paragraphs };
}
export function fromDoc(doc: JSONContent): Pick<Content, "text" | "runs"> {
  const runs: NonNullable<Content["runs"]> = [];
  doc.content?.forEach((paragraph, index) => {
    if (index) runs.push({ text: "\n" });
    for (const node of paragraph.content ?? []) {
      if (node.type === "hardBreak") { runs.push({ text: "\n" }); continue; }
      const href = node.marks?.find((mark) => mark.type === "link")?.attrs?.href;
      runs.push({ text: node.text ?? "", color: node.marks?.find(mark => mark.type === "runColor")?.attrs?.color, bold: node.marks?.some((mark) => mark.type === "bold"), italic: node.marks?.some((mark) => mark.type === "italic"), underline: node.marks?.some((mark) => mark.type === "underline"), href: typeof href === "string" && presentationLinkSchema.safeParse(href).success ? href : undefined });
    }
  });
  return { text: runs.map((run) => run.text).join(""), runs };
}
