"use client";
import { SourcePassageButton } from "./source-passage-button";
import { ySyncPluginKey } from "@tiptap/y-tiptap";

import { editorLinkDOMEvents } from "../lib/editor-links";

import { useEffect, useLayoutEffect, useRef } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import Collaboration from "@tiptap/extension-collaboration";
import { useCollaborationContext } from "../collaboration/ui";
import { richExtensions, toDoc, fromDoc, type Content } from "../collaboration/rich-text";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { presentationLinkSchema } from "../lib/presentation";


/**
 * `inline` is the on-canvas editor. It is only mounted on the client, in response to the
 * author entering edit mode, so it renders its editor immediately and takes focus with
 * the whole text selected in the same commit: keys typed right after Enter or a
 * double-click must land in the text, not on the canvas.
 */
export function PresentationRichText({ content, onChange, disabled, elementId, inline = false, autoFocus = inline, label, onReady }: { label?: string; autoFocus?: boolean; inline?: boolean; elementId: string; content: Content; onChange: (content: Content) => void; disabled?: boolean; onReady?: (editor: Editor) => void }) {
  const collaboration = useCollaborationContext();
  const t = useTranslations("presentationStudio");
  const current = useRef({ content, onChange });
  useEffect(() => { current.current = { content, onChange }; });
  const editor = useEditor({
    immediatelyRender: inline,
    autofocus: autoFocus && !inline ? "all" : false,
    extensions: [...richExtensions(), ...(collaboration ? [Collaboration.configure({ document: collaboration.doc, field: `rich:${elementId}` })] : [])],
    content: collaboration ? undefined : toDoc(content), editable: !disabled,
    editorProps: {
      handleDOMEvents: editorLinkDOMEvents, attributes: { class: inline ? "h-full min-h-12 outline-none" : "min-h-24 rounded-md border p-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500", role: "textbox", "aria-label": label ?? t("richText"), "aria-multiline": "true" } },
    onUpdate: ({ editor, transaction }) => {
      const next = fromDoc(editor.getJSON());
      if (next.text.length > 5000 || (next.runs?.length ?? 0) > 200) editor.commands.undo();
      else if (!transaction.getMeta(ySyncPluginKey)?.isChangeOrigin
        && JSON.stringify(fromDoc(toDoc(current.current.content))) !== JSON.stringify(next)) {
        current.current.onChange({ ...current.current.content, ...next });
      }
    },
  });
  const ready = useRef(onReady);
  useLayoutEffect(() => { ready.current = onReady; });
  useLayoutEffect(() => {
    if (!inline || !editor || editor.isDestroyed) return;
    if (autoFocus) {
      const { doc } = editor.state;
      editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(doc, TextSelection.atStart(doc).from, TextSelection.atEnd(doc).to)));
      editor.view.focus();
    }
    ready.current?.(editor);
  }, [inline, editor, autoFocus]);
  // Access changes are not content edits and must not add autosaves or undo steps.
  useEffect(() => { editor?.setEditable(!disabled, false); }, [editor, disabled]);
  useEffect(() => {
    if (!collaboration && editor && JSON.stringify(fromDoc(editor.getJSON())) !== JSON.stringify({ text: content.text, runs: content.runs })) {
      // Avoid replacing the selection for an update emitted by this editor.
      const next = toDoc(content);
      if (JSON.stringify(editor.getJSON()) !== JSON.stringify(next)) editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [content, editor, collaboration]);
  return <div className={inline ? "h-full" : "space-y-2"}>
    {!inline && <div className="flex flex-wrap gap-1">
      {(["bold", "italic", "underline"] as const).map((mark) => <Button key={mark} type="button" size="sm" variant="outline" disabled={disabled} onClick={() => editor?.chain().focus().toggleMark(mark).run()}>{t(mark)}</Button>)}
      <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => {
        const href = window.prompt(t("linkPrompt"), editor?.getAttributes("link").href ?? "https://");
        if (href === null) return;
        if (!presentationLinkSchema.safeParse(href).success) return;
        if (!href) editor?.chain().focus().unsetLink().run(); else editor?.chain().focus().setLink({ href }).run();
      }}>{t("link")}</Button>
    </div>}
    <div className={inline ? "absolute -top-10 left-0 z-50 rounded bg-background shadow" : ""} onPointerDown={(event) => event.stopPropagation()}><SourcePassageButton editor={editor} /></div>
    <EditorContent editor={editor} />
  </div>;
}
