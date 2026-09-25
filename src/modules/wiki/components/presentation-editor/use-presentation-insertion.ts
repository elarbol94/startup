"use client";
// Inserting new presentation elements at the viewport centre: text, frame, shape, chart/icon,
// and uploaded images and media. Used by presentation-editor.tsx.
import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { useTranslations } from "next-intl";
import { createId } from "@paralleldrive/cuid2";
import { toast } from "sonner";
import type { PresentationElement, PresentationShapeKind, presentationIconNames } from "../../lib/presentation";
import type { PresentationRecord } from "../../presentation-queries";
import { PRESENTATION_FRAME_SIZE } from "../../lib/presentation-frames";

const MAX_IMAGE_SIDE = 480;

export function usePresentationInsertion({ addElement, viewportCenter, t, studio, presentation, disabled, uploading, setUploading }: {
  addElement: (element: PresentationElement, place?: boolean) => void;
  viewportCenter: () => { x: number; y: number };
  t: ReturnType<typeof useTranslations<"wiki">>;
  studio: ReturnType<typeof useTranslations<"presentationStudio">>;
  presentation: PresentationRecord;
  disabled: boolean;
  uploading: boolean;
  setUploading: Dispatch<SetStateAction<boolean>>;
}) {
  const addText = useCallback(() => {
    const { x, y } = viewportCenter();
    addElement({
      id: createId(), type: "text", x: x - 160, y: y - 30, width: 320, height: 60, rotation: 0,
      content: { text: t("presentations.newTextPlaceholder"), fontSize: 32, bold: false, color: "", align: "left" },
    });
  }, [addElement, t, viewportCenter]);

  const addFrame = useCallback(() => {
    const { x, y } = viewportCenter();
    const { width, height } = PRESENTATION_FRAME_SIZE;
    // Named "Rahmen N" and added to the path when placed (frameInsertionEdit).
    addElement({
      id: createId(), type: "frame", x: x - width / 2, y: y - height / 2, width, height, rotation: 0,
      content: { label: "", shape: "rect", color: "" },
    });
  }, [addElement, viewportCenter]);

  const addShape = useCallback((shape: PresentationShapeKind = "rect") => {
    const { x, y } = viewportCenter();
    addElement({
      id: createId(), type: "shape", x: x - 140, y: y - 90, width: 280, height: 180, rotation: 0,
      content: { shape, fill: "", stroke: "", strokeWidth: 2, opacity: 1 },
    });
  }, [addElement, viewportCenter]);

  const addStudioElement = (type: "chart" | "icon", choice?: string) => {
    const { x, y } = viewportCenter();
    const base = { id: createId(), x: x - 240, y: y - 150, width: 480, height: 300, rotation: 0 };
    if (type === "chart") addElement({ ...base, type, content: { title: studio("chartTitle"), kind: (choice ?? "bar") as "bar" | "line" | "pie", data: [{ label: "A", value: 20 }, { label: "B", value: 40 }, { label: "C", value: 30 }] } });
    else addElement({ ...base, width: 120, height: 120, type, content: { name: (choice ?? "target") as typeof presentationIconNames[number], color: "#6366f1" } });
  };

  const uploadMedia = async (file: File) => {
    if (disabled || uploading) return;
    setUploading(true);
    try {
      const body = new FormData(); body.append("file", file); body.append("entityType", "wikiPresentation"); body.append("entityId", presentation.id);
      const response = await fetch("/api/files", { method: "POST", body });
      const payload = await response.json();
      if (!response.ok || !payload.id) throw new Error("Upload failed");
      const { x, y } = viewportCenter();
      addElement({ id: createId(), type: file.type.startsWith("video/") ? "video" : "audio", x: x - 240, y: y - 135, width: 480, height: file.type.startsWith("video/") ? 270 : 80, rotation: 0, content: { attachmentId: payload.id, title: file.name } });
    } catch { toast.error(studio("uploadFailed")); } finally { setUploading(false); }
  };

  const uploadImage = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        // Natural proportions up front, so the picture is not stretched into a default box.
        const objectUrl = URL.createObjectURL(file);
        const size = await new Promise<{ width: number; height: number }>((resolve) => {
          const image = new Image();
          image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
          image.onerror = () => resolve({ width: MAX_IMAGE_SIDE, height: MAX_IMAGE_SIDE });
          image.src = objectUrl;
        });
        URL.revokeObjectURL(objectUrl);

        const body = new FormData();
        body.append("file", file);
        body.append("entityType", "wikiPresentation");
        body.append("entityId", presentation.id);
        const response = await fetch("/api/files", { method: "POST", body });
        const payload = (await response.json()) as { id?: string; error?: string };
        if (!response.ok || !payload.id) throw new Error(payload.error ?? "upload failed");

        const scale = MAX_IMAGE_SIDE / Math.max(size.width, size.height, 1);
        const { x, y } = viewportCenter();
        const width = Math.max(40, Math.round(size.width * scale));
        const height = Math.max(40, Math.round(size.height * scale));
        addElement({
          id: createId(), type: "image", x: x - width / 2, y: y - height / 2, width, height, rotation: 0,
          content: { attachmentId: payload.id, alt: file.name },
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("presentations.uploadFailed"));
      } finally {
        setUploading(false);
      }
    },
    [addElement, presentation.id, t, viewportCenter, setUploading],
  );

  return { addText, addFrame, addShape, addStudioElement, uploadMedia, uploadImage };
}
