"use client";
// Exposes the wiki editor's imperative handle (flush save, insert graphic) through actionsRef.
// Used by wiki-editor.tsx.
import { useEffect, type RefObject } from "react";
import type { Editor } from "@tiptap/react";
import { imageNodeAttrs } from "./wiki-editor-document-ops";
import type { WikiEditorHandle } from "./wiki-editor-types";

export function useWikiEditorHandle({ actionsRef, editor, flushSaveRef }: {
  actionsRef?: RefObject<WikiEditorHandle | null>;
  editor: Editor | null;
  flushSaveRef: RefObject<() => Promise<boolean>>;
}) {
  // Lets the sidebar graphics section drop a graphic in at the cursor. The
  // editor owns the document, so it exposes the action rather than the reverse.
  useEffect(() => {
    if (!actionsRef || !editor) return;
    actionsRef.current = {
      flushSave: () => flushSaveRef.current(),
      insertGraphic: ({ attachmentId, fileName, contentUrl, caption }) => {
        // Insert *after* the selection rather than into it: a freshly inserted
        // graphic stays selected as a node, and inserting into that selection
        // would replace the graphic that was just dropped in.
        const at = editor.state.selection.to;
        editor.chain().insertContentAt(at, {
          type: "commentableImage",
          // The rendered URL, not /api/files, so document typography applies immediately.
          attrs: {
            ...imageNodeAttrs({ id: attachmentId, fileName, mimeType: "image/svg+xml" }),
            src: contentUrl,
            // The sidecar's ready-made Bildunterschrift wins over the filename.
            ...(caption ? { caption } : {}),
          },
        }).focus().run();
      },
    };
    return () => { actionsRef.current = null; };
  }, [actionsRef, editor, flushSaveRef]);
}
