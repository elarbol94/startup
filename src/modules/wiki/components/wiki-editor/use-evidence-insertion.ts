"use client";
// Inserts the PDF evidence handed over from the reader (?insertEvidence=) exactly once and
// strips it from the URL. Used by wiki-editor.tsx.
import { useEffect, useRef } from "react";
import type { useRouter } from "next/navigation";
import type { useTranslations } from "next-intl";
import type { Editor } from "@tiptap/react";
import { toast } from "sonner";
import { evidenceInsertContent } from "./wiki-editor-document-ops";
import type { EvidenceRef } from "./wiki-editor-types";

export function useEvidenceInsertion({ editor, insertEvidenceId, citationLocale, router, t }: {
  editor: Editor | null;
  insertEvidenceId?: string;
  citationLocale: string;
  router: ReturnType<typeof useRouter>;
  t: ReturnType<typeof useTranslations<"wiki">>;
}) {
  const insertedEvidence = useRef<string | null>(null);
  useEffect(() => {
    if (!editor || !insertEvidenceId) return;
    // Inserting is a mutation, not a focus like the effects below, so it must happen
    // exactly once: the ref guards a re-render and the URL is stripped immediately so
    // a reload cannot repeat it.
    if (insertedEvidence.current === insertEvidenceId) return;
    insertedEvidence.current = insertEvidenceId;
    const url = new URL(window.location.href);
    url.searchParams.delete("insertEvidence");
    router.replace(url.pathname + url.search, { scroll: false });
    void (async () => {
      try {
        const response = await fetch(`/api/wiki/evidence?annotationId=${encodeURIComponent(insertEvidenceId)}`);
        if (!response.ok) throw new Error(t("evidenceInsertFailed"));
        const { annotation } = await response.json() as { annotation: EvidenceRef };
        editor.chain().focus("end").insertContent(evidenceInsertContent(annotation, citationLocale)).run();
        toast.success(t("evidenceInserted", { source: annotation.sourceTitle }));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("evidenceInsertFailed"));
      }
    })();
  }, [citationLocale, editor, insertEvidenceId, router, t]);
}
