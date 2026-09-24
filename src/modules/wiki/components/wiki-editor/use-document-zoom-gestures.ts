"use client";
// Ctrl/Cmd + wheel and Ctrl/Cmd +/-/0 zooming of the wiki document, keeping the anchored point
// under the pointer after each zoom step. Used by wiki-editor.tsx.
import { useEffect, useLayoutEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { Editor } from "@tiptap/react";
import { DOCUMENT_ZOOM_MAX, DOCUMENT_ZOOM_MIN, keepZoomAnchorInPlace } from "./document-zoom";

export type DocumentZoomAnchor = { clientX: number; clientY: number; contentX: number; contentY: number };

export function useDocumentZoomGestures({ editor, editorRootRef, documentZoom, setDocumentZoom, appliedZoom: appliedZoomRef, zoomAnchor: zoomAnchorRef, captureZoomAnchorRef }: {
  editor: Editor | null;
  editorRootRef: RefObject<HTMLDivElement | null>;
  documentZoom: number;
  setDocumentZoom: Dispatch<SetStateAction<number>>;
  appliedZoom: RefObject<number>;
  zoomAnchor: RefObject<DocumentZoomAnchor | null>;
  captureZoomAnchorRef: RefObject<(clientX: number, clientY: number) => void>;
}) {
  useLayoutEffect(() => {
    const anchor = zoomAnchorRef.current;
    appliedZoomRef.current = documentZoom;
    zoomAnchorRef.current = null;
    const surface = editorRootRef.current?.querySelector<HTMLElement>(".wiki-editor-surface");
    if (!anchor || !surface) return;
    // Runs before paint, so the correction is part of the same frame as the zoom.
    const rect = surface.getBoundingClientRect();
    const scale = documentZoom / 100;
    keepZoomAnchorInPlace(
      surface,
      rect.left + anchor.contentX * scale - anchor.clientX,
      rect.top + anchor.contentY * scale - anchor.clientY,
    );
  }, [documentZoom, appliedZoomRef, editorRootRef, zoomAnchorRef]);
  useEffect(() => {
    const workspace = editorRootRef.current;
    if (!workspace) return;
    let controlPressed = false;

    const zoomEditor = (event: WheelEvent) => {
      const target = event.target;
      const activeElement = document.activeElement;
      const belongsToEditor = target instanceof globalThis.Node && workspace.contains(target);
      const editorFocused = activeElement instanceof globalThis.Node && workspace.contains(activeElement);
      if ((!event.ctrlKey && !event.metaKey && !controlPressed) || (!belongsToEditor && !editorFocused)) return;
      event.preventDefault();
      event.stopPropagation();
      const direction = event.deltaY < 0 ? 1 : -1;
      const intensity = Math.max(1, Math.min(4, Math.round(Math.abs(event.deltaY) / 25)));
      captureZoomAnchorRef.current(event.clientX, event.clientY);
      setDocumentZoom((value) => Math.min(DOCUMENT_ZOOM_MAX, Math.max(DOCUMENT_ZOOM_MIN, value + direction * intensity * 2)));
    };
    const trackControlKey = (event: KeyboardEvent) => {
      if (event.key === "Control" || event.key === "Meta") controlPressed = event.type === "keydown";
      if (event.type !== "keydown" || (!event.ctrlKey && !event.metaKey)) return;
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        captureZoomAnchorRef.current(window.innerWidth / 2, window.innerHeight / 2);
        setDocumentZoom((value) => Math.min(DOCUMENT_ZOOM_MAX, value + 10));
      } else if (event.key === "-") {
        event.preventDefault();
        captureZoomAnchorRef.current(window.innerWidth / 2, window.innerHeight / 2);
        setDocumentZoom((value) => Math.max(DOCUMENT_ZOOM_MIN, value - 10));
      } else if (event.key === "0") {
        event.preventDefault();
        captureZoomAnchorRef.current(window.innerWidth / 2, window.innerHeight / 2);
        setDocumentZoom(100);
      }
    };
    const releaseControlKey = () => { controlPressed = false; };

    window.addEventListener("wheel", zoomEditor, { capture: true, passive: false });
    window.addEventListener("keydown", trackControlKey, true);
    window.addEventListener("keyup", trackControlKey, true);
    window.addEventListener("blur", releaseControlKey);
    return () => {
      window.removeEventListener("wheel", zoomEditor, true);
      window.removeEventListener("keydown", trackControlKey, true);
      window.removeEventListener("keyup", trackControlKey, true);
      window.removeEventListener("blur", releaseControlKey);
    };
  }, [editor, captureZoomAnchorRef, editorRootRef, setDocumentZoom]);
}
