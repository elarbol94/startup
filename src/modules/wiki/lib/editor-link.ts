import type { Editor } from "@tiptap/core";

/** End link insertion without clearing the surrounding text's other marks. */
export function applyEditorLink(
  editor: Editor,
  href: string,
  label: string,
  range: { from: number; to: number } = editor.state.selection,
) {
  const { from, to } = range;
  const chain = editor.chain().focus().setTextSelection({ from, to });
  if (from === to) {
    const marks = (editor.state.storedMarks ?? editor.state.doc.resolve(from).marks())
      .filter((mark) => mark.type.name !== "link")
      .map((mark) => mark.toJSON());
    chain.insertContent({ type: "text", text: label, marks: [...marks, { type: "link", attrs: { href } }] });
  } else {
    chain.setLink({ href }).setTextSelection(to);
  }
  // unsetLink would remove the existing link in some command configurations.
  // Only stored marks (the formatting of subsequent typing) should change.
  return chain.command(({ tr }) => {
    tr.setStoredMarks((tr.storedMarks ?? tr.selection.$from.marks()).filter((mark) => mark.type.name !== "link"));
    return true;
  }).run();
}
