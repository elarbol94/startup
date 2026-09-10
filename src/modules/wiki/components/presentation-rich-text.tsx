"use client";

import { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import Collaboration from "@tiptap/extension-collaboration";
import { useCollaborationContext } from "../collaboration/ui";
import { richExtensions, toDoc, fromDoc, type Content } from "../collaboration/rich-text";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { presentationLinkSchema } from "../lib/presentation";


export function PresentationRichText({ content, onChange, disabled, elementId, inline = false }: { inline?: boolean; elementId: string; content: Content; onChange: (content: Content) => void; disabled?: boolean }) {
  const collaboration = useCollaborationContext();
  const t = useTranslations("presentationStudio");
  const current = useRef({ content, onChange });
  useEffect(() => { current.current = { content, onChange }; });
  const editor = useEditor({
    immediatelyRender: false,
    autofocus: inline ? "end" : false,
    extensions: [...richExtensions(), ...(collaboration ? [Collaboration.configure({ document: collaboration.doc, field: `rich:${elementId}` })] : [])],
    content: collaboration ? undefined : toDoc(content), editable: !disabled,
    editorProps: { attributes: { class: inline ? "h-full min-h-12 outline-none" : "min-h-24 rounded-md border p-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500", role: "textbox", "aria-label": t("richText"), "aria-multiline": "true" } },
    onUpdate: ({ editor }) => {
      const next = fromDoc(editor.getJSON());
      if (next.text.length > 5000 || (next.runs?.length ?? 0) > 200) editor.commands.undo();
      else if (!collaboration) current.current.onChange({ ...current.current.content, ...next });
    },
  });
  // Access changes are not content edits and must not add autosaves or undo steps.
  useEffect(() => { editor?.setEditable(!disabled, false); }, [editor, disabled]);
  useEffect(() => {
    if (!collaboration && editor && JSON.stringify(fromDoc(editor.getJSON())) !== JSON.stringify({ text: content.text, runs: content.runs })) {
      // Avoid replacing the selection for an update emitted by this editor.
      const next = toDoc(content);
      if (JSON.stringify(editor.getJSON()) !== JSON.stringify(next)) editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [content, editor, collaboration]);
  return <div className="space-y-2">
    {!inline && <div className="flex flex-wrap gap-1">
      {(["bold", "italic", "underline"] as const).map((mark) => <Button key={mark} type="button" size="sm" variant="outline" disabled={disabled} onClick={() => editor?.chain().focus().toggleMark(mark).run()}>{t(mark)}</Button>)}
      <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => {
        const href = window.prompt(t("linkPrompt"), editor?.getAttributes("link").href ?? "https://");
        if (href === null) return;
        if (!presentationLinkSchema.safeParse(href).success) return;
        if (!href) editor?.chain().focus().unsetLink().run(); else editor?.chain().focus().setLink({ href }).run();
      }}>{t("link")}</Button>
    </div>}
    <EditorContent editor={editor} />
  </div>;
}
