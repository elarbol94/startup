"use client";

// Annotation thread state and actions for the PDF reader: replies (create, edit, delete),
// label/note edits, deletion with undo, citations and sending to a wiki page.
// Used by pdf-reader.tsx (rendered in pdf-comment-panel.tsx).
import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { useRouter } from "next/navigation";
import type { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  createPdfAnnotationComment, deletePdfAnnotation, deletePdfAnnotationComment, restorePdfAnnotation,
  updatePdfAnnotation, updatePdfAnnotationComment,
} from "../../pdf-actions";
import { formatPdfCitation } from "../../lib/pdf-reader-utils";
import type { ReaderAnnotation } from "./pdf-reader-types";

export function usePdfAnnotationThreads({
  setAnnotations, t, router, sourceTitle, showCommentList,
}: {
  setAnnotations: Dispatch<SetStateAction<ReaderAnnotation[]>>;
  t: ReturnType<typeof useTranslations<"wiki">>;
  router: ReturnType<typeof useRouter>;
  sourceTitle: string;
  showCommentList: () => void;
}) {
  const [sendToPageFor, setSendToPageFor] = useState<string | null>(null);
  const [pageFilter, setPageFilter] = useState("");
  const [editingAnnotation, setEditingAnnotation] = useState(false);
  const [annotationEditDraft, setAnnotationEditDraft] = useState({ label: "", note: "" });
  const [replyByAnnotation, setReplyByAnnotation] = useState<Record<string, string>>({});
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentPending, setCommentPending] = useState(false);
  const commentBusy = useRef(false);
  const [commentDraftById, setCommentDraftById] = useState<Record<string, string>>({});

  async function submitReply(annotationId: string) {
    const body = replyByAnnotation[annotationId]?.trim(); if (!body) return;
    if (commentBusy.current) return;
    commentBusy.current = true; setCommentPending(true);
    try {
      const comment = await createPdfAnnotationComment({ annotationId, body });
      setAnnotations((items) => items.map((annotation) => annotation.id === annotationId ? { ...annotation, comments: [...annotation.comments, comment] } : annotation));
      setReplyByAnnotation((items) => ({ ...items, [annotationId]: "" }));
    } catch { toast.error(t("commentFailed")); }
    finally { commentBusy.current = false; setCommentPending(false); }
  }

  async function saveEditedReply(annotationId: string, commentId: string) {
    const body = commentDraftById[commentId]?.trim(); if (!body) return;
    if (commentBusy.current) return;
    commentBusy.current = true; setCommentPending(true);
    try {
      const updated = await updatePdfAnnotationComment({ id: commentId, body });
      setAnnotations((items) => items.map((annotation) => annotation.id === annotationId ? {
        ...annotation,
        comments: annotation.comments.map((comment) => comment.id === commentId ? { ...comment, body: updated.body } : comment),
      } : annotation));
      setEditingCommentId(null);
      setCommentDraftById((items) => { const next = { ...items }; delete next[commentId]; return next; });
    } catch { toast.error(t("commentFailed")); }
    finally { commentBusy.current = false; setCommentPending(false); }
  }

  async function removeReply(annotationId: string, commentId: string) {
    if (commentBusy.current || !window.confirm(t("deleteReplyConfirm"))) return;
    commentBusy.current = true; setCommentPending(true);
    try {
      await deletePdfAnnotationComment(commentId);
      setAnnotations((items) => items.map((annotation) => annotation.id === annotationId
        ? { ...annotation, comments: annotation.comments.filter((comment) => comment.id !== commentId) } : annotation));
    } catch { toast.error(t("commentFailed")); }
    finally { commentBusy.current = false; setCommentPending(false); }
  }

  function beginEditingReply(comment: ReaderAnnotation["comments"][number]) {
    setCommentDraftById((items) => ({ ...items, [comment.id]: comment.body }));
    setEditingCommentId(comment.id);
  }

  /**
   * Hands an annotation to a wiki page: the editor reads insertEvidence from the URL,
   * inserts the evidence block with its citation, and strips the parameter.
   */
  function sendAnnotationToPage(annotation: ReaderAnnotation, slug: string) {
    setSendToPageFor(null);
    setPageFilter("");
    router.push(`/wiki/pages/${encodeURIComponent(slug)}?insertEvidence=${encodeURIComponent(annotation.id)}`);
  }

  async function copyAnnotationCitation(annotation: ReaderAnnotation) {
    await navigator.clipboard.writeText(formatPdfCitation(sourceTitle, annotation.pageNumber, annotation.selectedText || annotation.note));
    toast.success(t("citationCopied"));
  }

  function beginEditingAnnotation(annotation: ReaderAnnotation) {
    setAnnotationEditDraft({ label: annotation.label, note: annotation.note });
    setEditingAnnotation(true);
  }

  async function saveAnnotationEdits(annotation: ReaderAnnotation) {
    await updatePdfAnnotation({ id: annotation.id, ...annotationEditDraft });
    setAnnotations((items) => items.map((item) => item.id === annotation.id ? { ...item, ...annotationEditDraft, updatedAt: new Date().toISOString() } : item));
    setEditingAnnotation(false);
    toast.success(t("annotationUpdated"));
  }

  async function removeAnnotation(annotation: ReaderAnnotation) {
    await deletePdfAnnotation(annotation.id);
    setAnnotations((items) => items.filter((item) => item.id !== annotation.id));
    showCommentList();
    toast(t("annotationDeleted"), {
      action: {
        label: t("undo"),
        onClick: () => { void restorePdfAnnotation(annotation.id); setAnnotations((items) => [...items, annotation].sort((left, right) => left.pageNumber - right.pageNumber)); },
      },
    });
  }

  return {
    sendToPageFor, setSendToPageFor, pageFilter, setPageFilter, editingAnnotation, setEditingAnnotation,
    annotationEditDraft, setAnnotationEditDraft, replyByAnnotation, setReplyByAnnotation, editingCommentId,
    setEditingCommentId, commentPending, commentDraftById, setCommentDraftById, submitReply, saveEditedReply,
    removeReply, beginEditingReply, sendAnnotationToPage, copyAnnotationCitation, beginEditingAnnotation,
    saveAnnotationEdits, removeAnnotation,
  };
}
