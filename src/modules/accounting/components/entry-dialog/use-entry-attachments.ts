// Receipt attachments of an entry: loads the saved ones when the dialog opens, keeps files
// picked before saving, uploads them once the entry has an id, and deletes saved receipts.
// Uses the existing /api/files store. Used by entry-dialog.tsx.
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { EntryRow } from "@/modules/accounting/queries";
import type { AttachmentDto } from "./entry-dialog-types";

export function useEntryAttachments(open: boolean, entry: EntryRow | null) {
  const tf = useTranslations("accountingEntry");
  const [existingAttachments, setExistingAttachments] = useState<AttachmentDto[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  useEffect(() => {
    if (!open || !entry) return;
    let cancelled = false;
    fetch(`/api/files?entityType=entry&entityId=${entry.id}`)
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => {
        if (!cancelled) setExistingAttachments(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, entry]);

  async function uploadFiles(entryId: string) {
    const failedFiles: File[] = [];
    const uploadedAttachments: AttachmentDto[] = [];

    for (const file of pendingFiles) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("entityType", "entry");
        formData.append("entityId", entryId);
        const response = await fetch("/api/files", { method: "POST", body: formData });
        if (!response.ok) {
          failedFiles.push(file);
          continue;
        }
        const attachment = await response.json() as AttachmentDto;
        uploadedAttachments.push({
          id: attachment.id,
          fileName: attachment.fileName,
        });
      } catch {
        failedFiles.push(file);
      }
    }

    if (uploadedAttachments.length > 0) {
      setExistingAttachments((current) => [
        ...current,
        ...uploadedAttachments.filter(
          (attachment) => !current.some((item) => item.id === attachment.id),
        ),
      ]);
    }
    setPendingFiles(failedFiles);
    return failedFiles;
  }

  async function removeExistingAttachment(id: string) {
    try {
      const response = await fetch(`/api/files/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Attachment delete failed");
      setExistingAttachments((current) => current.filter((item) => item.id !== id));
    } catch {
      toast.error(tf("receiptDeleteFailed"));
    }
  }

  return {
    existingAttachments,
    setExistingAttachments,
    pendingFiles,
    setPendingFiles,
    uploadFiles,
    removeExistingAttachment,
  };
}
