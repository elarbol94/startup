"use client";

// Annotation comment panel of the PDF reader: the filterable comment list and a single
// annotation thread with replies. Rendered by pdf-reader.tsx (desktop aside and mobile sheet).
import type { Dispatch, SetStateAction } from "react";
import type { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, ArrowUp, ChevronLeft, ChevronRight, Clock3, Copy, FileText, Link2, MessageCircle, Pencil, Search, Trash2, X } from "lucide-react";
import { PersonSelect } from "@/components/person-select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { USER_MARK_COLORS, initialsForName, userMarkColorStyle, type UserMarkColor } from "@/lib/user-mark-colors";
import { rememberSourcePassage } from "../../lib/source-passage";
import type { CommentPanelState, ReaderAnnotation } from "./pdf-reader-types";

function NoteMeta({ name, timestamp, markColor, userId }: { name: string; timestamp: string; markColor: UserMarkColor; userId: string }) {
  return <span className="mt-1.5 inline-flex items-center gap-1.5 text-[10px] text-muted-foreground" style={userMarkColorStyle(markColor, userId)}><Avatar size="sm" className="size-4 border" style={{ borderColor: "var(--user-mark-solid)" }}><AvatarFallback className="text-[8px]" style={{ color: "var(--user-mark-solid)", backgroundColor: "var(--user-mark-highlight)" }}>{initialsForName(name)}</AvatarFallback></Avatar><span>{name}</span><Clock3 className="size-3" /><time>{timestamp}</time></span>;
}

export type PdfCommentPanelProps = {
  t: ReturnType<typeof useTranslations<"wiki">>;
  tMarkColor: ReturnType<typeof useTranslations<"settings.profile.colors">>;
  format: ReturnType<typeof useFormatter>;
  user: { id: string; name: string; role?: string | null; markColor: UserMarkColor };
  sourceTitle: string;
  wikiPages: Array<{ id: string; title: string; slug: string }>;
  commentPanel: CommentPanelState;
  selectedAnnotation: ReaderAnnotation | undefined;
  activeAnnotationId: string;
  commentThreads: ReaderAnnotation[];
  filteredCommentThreads: ReaderAnnotation[];
  annotationAuthors: Array<[string, string]>;
  commentSearch: string;
  setCommentSearch: Dispatch<SetStateAction<string>>;
  annotationKindFilter: string;
  setAnnotationKindFilter: Dispatch<SetStateAction<string>>;
  annotationColorFilter: string;
  setAnnotationColorFilter: Dispatch<SetStateAction<string>>;
  annotationAuthorFilter: string;
  setAnnotationAuthorFilter: Dispatch<SetStateAction<string>>;
  currentPageCommentsOnly: boolean;
  setCurrentPageCommentsOnly: Dispatch<SetStateAction<boolean>>;
  editingAnnotation: boolean;
  setEditingAnnotation: Dispatch<SetStateAction<boolean>>;
  annotationEditDraft: { label: string; note: string };
  setAnnotationEditDraft: Dispatch<SetStateAction<{ label: string; note: string }>>;
  editingCommentId: string | null;
  setEditingCommentId: Dispatch<SetStateAction<string | null>>;
  commentPending: boolean;
  commentDraftById: Record<string, string>;
  setCommentDraftById: Dispatch<SetStateAction<Record<string, string>>>;
  replyByAnnotation: Record<string, string>;
  setReplyByAnnotation: Dispatch<SetStateAction<Record<string, string>>>;
  sendToPageFor: string | null;
  setSendToPageFor: Dispatch<SetStateAction<string | null>>;
  pageFilter: string;
  setPageFilter: Dispatch<SetStateAction<string>>;
  showCommentList: () => void;
  closeCommentPanel: () => void;
  moveAnnotation: (direction: 1 | -1) => void;
  openAnnotation: (annotation: ReaderAnnotation, navigateToPage?: boolean, target?: HTMLElement) => void;
  readerUrl: (nextPage: number, annotationId?: string, taskId?: string) => string;
  saveAnnotationEdits: (annotation: ReaderAnnotation) => Promise<void>;
  beginEditingAnnotation: (annotation: ReaderAnnotation) => void;
  removeAnnotation: (annotation: ReaderAnnotation) => Promise<void>;
  copyAnnotationCitation: (annotation: ReaderAnnotation) => Promise<void>;
  sendAnnotationToPage: (annotation: ReaderAnnotation, slug: string) => void;
  submitReply: (annotationId: string) => Promise<void>;
  saveEditedReply: (annotationId: string, commentId: string) => Promise<void>;
  removeReply: (annotationId: string, commentId: string) => Promise<void>;
  beginEditingReply: (comment: ReaderAnnotation["comments"][number]) => void;
};

export function PdfCommentPanel({
  t, tMarkColor, format, user, sourceTitle, wikiPages, commentPanel, selectedAnnotation, activeAnnotationId, commentThreads,
  filteredCommentThreads, annotationAuthors, commentSearch, setCommentSearch, annotationKindFilter, setAnnotationKindFilter,
  annotationColorFilter, setAnnotationColorFilter, annotationAuthorFilter, setAnnotationAuthorFilter, currentPageCommentsOnly,
  setCurrentPageCommentsOnly, editingAnnotation, setEditingAnnotation, annotationEditDraft, setAnnotationEditDraft,
  editingCommentId, setEditingCommentId, commentPending, commentDraftById, setCommentDraftById, replyByAnnotation,
  setReplyByAnnotation, sendToPageFor, setSendToPageFor, pageFilter, setPageFilter, showCommentList, closeCommentPanel,
  moveAnnotation, openAnnotation, readerUrl, saveAnnotationEdits, beginEditingAnnotation, removeAnnotation,
  copyAnnotationCitation, sendAnnotationToPage, submitReply, saveEditedReply, removeReply, beginEditingReply,
}: PdfCommentPanelProps) {
  if (commentPanel.mode === "thread" && selectedAnnotation) return <div data-testid="pdf-annotation-thread" className="flex h-full min-h-0 flex-col">
    <header className="flex items-center gap-1 border-b p-2"><Button type="button" variant="ghost" size="icon-sm" aria-label={t("backToComments")} onClick={showCommentList}><ArrowLeft className="size-4" /></Button><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{selectedAnnotation.label || t(`annotationKinds.${selectedAnnotation.kind}`)}</p><p className="text-[11px] text-muted-foreground">{t("pageNumber", { page: selectedAnnotation.pageNumber })}</p></div><Button type="button" variant="ghost" size="icon-xs" aria-label={t("previousAnnotation")} onClick={() => moveAnnotation(-1)}><ChevronLeft /></Button><Button type="button" variant="ghost" size="icon-xs" aria-label={t("nextAnnotation")} onClick={() => moveAnnotation(1)}><ChevronRight /></Button><Button type="button" variant="ghost" size="icon-sm" aria-label={t("cancel")} onClick={closeCommentPanel}><X className="size-4" /></Button></header>
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <button type="button" className="mb-3 w-full rounded-lg border bg-muted/30 p-2 text-left text-xs hover:bg-muted/60" onClick={() => openAnnotation(selectedAnnotation, true)}><span className="font-medium">{t("pageNumber", { page: selectedAnnotation.pageNumber })}</span><span className="mt-1 line-clamp-3 block text-muted-foreground">{selectedAnnotation.selectedText || selectedAnnotation.label || t(`annotationKinds.${selectedAnnotation.kind}`)}</span></button>
      {editingAnnotation ? <div className="space-y-2 rounded-lg border p-2.5"><Input value={annotationEditDraft.label} onChange={(event) => setAnnotationEditDraft((value) => ({ ...value, label: event.target.value }))} placeholder={t("annotationLabel")} /><Textarea value={annotationEditDraft.note} onChange={(event) => setAnnotationEditDraft((value) => ({ ...value, note: event.target.value }))} placeholder={t("note")} /><div className="flex justify-end gap-1"><Button size="xs" variant="ghost" onClick={() => setEditingAnnotation(false)}>{t("cancel")}</Button><Button size="xs" onClick={() => void saveAnnotationEdits(selectedAnnotation)}>{t("saveAnnotation")}</Button></div></div> : selectedAnnotation.note && <div className="rounded-lg border p-2.5" style={{ ...userMarkColorStyle(selectedAnnotation.createdByMarkColor, selectedAnnotation.createdBy), borderColor: "var(--user-mark-solid)" }}><NoteMeta userId={selectedAnnotation.createdBy} name={selectedAnnotation.createdByName} markColor={selectedAnnotation.createdByMarkColor} timestamp={format.dateTime(new Date(selectedAnnotation.createdAt), { dateStyle: "medium", timeStyle: "short" })} /><p className="mt-1 whitespace-pre-wrap text-[13px] leading-5">{selectedAnnotation.note}</p></div>}
      {selectedAnnotation.comments.length > 0 && <div className="mt-3 space-y-2">{selectedAnnotation.comments.map((comment) => {
        const editing = editingCommentId === comment.id; const canEdit = comment.createdBy === user.id || user.role === "admin";
        return <div key={comment.id} className="group rounded-lg border p-2.5" style={{ ...userMarkColorStyle(comment.createdByMarkColor, comment.createdBy), borderLeftColor: "var(--user-mark-solid)", borderLeftWidth: 2 }}><NoteMeta userId={comment.createdBy} name={comment.createdByName} markColor={comment.createdByMarkColor} timestamp={format.dateTime(new Date(comment.createdAt), { dateStyle: "medium", timeStyle: "short" })} />{editing ? <div className="relative mt-1"><Textarea disabled={commentPending} maxLength={10000} aria-label={t("editReply")} autoFocus rows={1} className="max-h-28 min-h-9 resize-none rounded-lg border-border/70 bg-transparent py-1.5 pr-8 text-[13px] shadow-none focus-visible:ring-1" value={commentDraftById[comment.id] ?? ""} onChange={(event) => setCommentDraftById((items) => ({ ...items, [comment.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void saveEditedReply(selectedAnnotation.id, comment.id); } if (event.key === "Escape") { event.preventDefault(); setEditingCommentId(null); } }} /><Button type="button" variant="ghost" size="icon-xs" aria-label={t("sendReply")} className="absolute bottom-1 right-1 rounded-full" disabled={commentPending || !commentDraftById[comment.id]?.trim()} onClick={() => void saveEditedReply(selectedAnnotation.id, comment.id)}><ArrowUp className="size-3.5" /></Button></div> : <div className="mt-1 flex items-end gap-1.5"><p className="min-w-0 flex-1 whitespace-pre-wrap text-[13px] leading-5 text-foreground/85">{comment.body}</p>{canEdit && <><Button disabled={commentPending} type="button" variant="ghost" size="icon-xs" aria-label={t("editReply")} className="shrink-0 rounded-full text-muted-foreground " onClick={() => beginEditingReply(comment)}><Pencil className="size-3" /></Button><Button type="button" variant="ghost" size="icon-xs" disabled={commentPending} aria-label={t("deleteReply")} onClick={() => void removeReply(selectedAnnotation.id, comment.id)}><Trash2 className="size-3 text-destructive" /></Button></>}</div>}</div>;
      })}</div>}
    </div>
    <div className="shrink-0 border-t p-2.5"><div className="relative"><Textarea disabled={commentPending} maxLength={10000} aria-label={t("replyToAnnotation")} data-testid="pdf-annotation-reply" rows={1} className="max-h-28 min-h-10 w-full resize-none rounded-xl border-border/70 bg-muted/20 px-3 py-2 pr-10 text-sm shadow-none transition-[background-color,border-color] focus-visible:bg-background focus-visible:ring-1" value={replyByAnnotation[selectedAnnotation.id] ?? ""} onChange={(event) => setReplyByAnnotation((items) => ({ ...items, [selectedAnnotation.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void submitReply(selectedAnnotation.id); } }} placeholder={t("replyToAnnotation")} /><Button type="button" variant="ghost" size="icon-sm" aria-label={t("sendReply")} className="absolute bottom-1 right-1 rounded-full text-muted-foreground enabled:text-foreground enabled:hover:bg-foreground/5" disabled={commentPending || !replyByAnnotation[selectedAnnotation.id]?.trim()} onClick={() => void submitReply(selectedAnnotation.id)}><ArrowUp className="size-4" /></Button></div><div className="mt-1 flex flex-wrap gap-1"><Button type="button" size="xs" variant="ghost" onClick={() => void copyAnnotationCitation(selectedAnnotation)}><Copy />{t("copyCitation")}</Button>{selectedAnnotation.kind === "text" && <Button type="button" size="xs" variant="ghost" onClick={() => { try { rememberSourcePassage({ href: readerUrl(selectedAnnotation.pageNumber, selectedAnnotation.id), title: sourceTitle, quote: selectedAnnotation.selectedText }); toast.success(t("sourcePassageReady"), { duration: 10000 }); } catch { toast.error(t("sourcePassageFailed")); } }}><Link2 />{t("prepareSourcePassage")}</Button>}{wikiPages.length > 0 && <Popover open={sendToPageFor === selectedAnnotation.id} onOpenChange={(value) => { setSendToPageFor(value ? selectedAnnotation.id : null); setPageFilter(""); }}><PopoverTrigger render={<Button type="button" size="xs" variant="ghost" />}><FileText />{t("sendToPage")}</PopoverTrigger><PopoverContent className="w-72 p-2"><Input autoFocus value={pageFilter} onChange={(event) => setPageFilter(event.target.value)} placeholder={t("findPage")} className="h-8" /><div className="mt-2 max-h-64 overflow-y-auto">{wikiPages.filter((item) => item.title.toLocaleLowerCase().includes(pageFilter.trim().toLocaleLowerCase())).slice(0, 50).map((item) => (<button key={item.id} type="button" className="block w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => sendAnnotationToPage(selectedAnnotation, item.slug)}>{item.title}</button>))}{wikiPages.filter((item) => item.title.toLocaleLowerCase().includes(pageFilter.trim().toLocaleLowerCase())).length === 0 && <p className="p-2 text-sm text-muted-foreground">{t("noSearchResults")}</p>}</div></PopoverContent></Popover>}{(selectedAnnotation.createdBy === user.id || user.role === "admin") && <><Button type="button" size="xs" variant="ghost" onClick={() => beginEditingAnnotation(selectedAnnotation)}><Pencil />{t("edit")}</Button><Button type="button" size="xs" variant="ghost" onClick={() => void removeAnnotation(selectedAnnotation)}><Trash2 />{t("delete")}</Button></>}</div></div>
  </div>;

  return <div data-testid="pdf-comment-list" className="flex h-full min-h-0 flex-col"><header className="flex items-center gap-2 border-b p-3"><MessageCircle className="size-4 text-indigo-600" /><h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{t("comments")}</h2><span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">{commentThreads.length}</span><Button type="button" variant="ghost" size="icon-sm" aria-label={t("cancel")} onClick={closeCommentPanel}><X className="size-4" /></Button></header><div className="space-y-2 border-b p-2"><div className="relative"><Search className="absolute left-2 top-2.5 size-3.5 text-muted-foreground" /><Input value={commentSearch} onChange={(event) => setCommentSearch(event.target.value)} className="h-8 pl-7 text-xs" placeholder={t("searchComments")} /></div><div className="grid grid-cols-3 gap-1"><select aria-label={t("filterKind")} value={annotationKindFilter} onChange={(event) => setAnnotationKindFilter(event.target.value)} className="h-7 min-w-0 rounded border bg-background px-1 text-[10px]"><option value="all">{t("allKinds")}</option>{(["text", "region", "bookmark"] as const).map((kind) => <option key={kind} value={kind}>{t(`annotationKinds.${kind}`)}</option>)}</select><select aria-label={t("filterColor")} value={annotationColorFilter} onChange={(event) => setAnnotationColorFilter(event.target.value)} className="h-7 min-w-0 rounded border bg-background px-1 text-[10px]"><option value="all">{t("allColors")}</option>{USER_MARK_COLORS.map((item) => <option key={item.key} value={item.key}>{tMarkColor(item.key)}</option>)}</select><PersonSelect label={t("filterAuthor")} value={annotationAuthorFilter === "all" ? "" : annotationAuthorFilter} onValueChange={value => setAnnotationAuthorFilter(value || "all")} emptyLabel={t("allAuthors")} options={annotationAuthors.map(([id, name]) => ({ value: id, userId: id, name }))} /></div><Button type="button" size="xs" variant={currentPageCommentsOnly ? "secondary" : "ghost"} onClick={() => setCurrentPageCommentsOnly((value) => !value)}>{currentPageCommentsOnly ? t("currentPageComments") : t("allComments")}</Button></div><div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">{filteredCommentThreads.map((annotation) => <button type="button" key={annotation.id} className="w-full rounded-lg border p-2.5 text-left text-xs transition-colors hover:bg-accent" style={{ ...userMarkColorStyle(annotation.createdByMarkColor, annotation.createdBy), borderColor: activeAnnotationId === annotation.id ? "var(--user-mark-solid)" : undefined, backgroundColor: activeAnnotationId === annotation.id ? "var(--user-mark-highlight)" : undefined }} onClick={() => openAnnotation(annotation, true)}><span className="flex items-center justify-between gap-2 font-medium"><span className="truncate">{annotation.label || t(`annotationKinds.${annotation.kind}`)}</span><span className="shrink-0 text-[10px] text-muted-foreground">{t("pageNumber", { page: annotation.pageNumber })}</span></span><span className="mt-1 line-clamp-2 block text-muted-foreground">{annotation.note || annotation.selectedText || t(`annotationKinds.${annotation.kind}`)}</span><span className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground"><span className="truncate" style={{ color: "var(--user-mark-solid)" }}>{annotation.createdByName}</span><span className="shrink-0">{annotation.comments.length} · <MessageCircle className="inline size-3" /></span></span></button>)}{filteredCommentThreads.length === 0 && <p className="p-4 text-center text-xs text-muted-foreground">{t("noMatchingComments")}</p>}</div></div>;
}
