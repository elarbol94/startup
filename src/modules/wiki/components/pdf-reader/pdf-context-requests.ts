// Opens the task or deadline creator for the current PDF selection, captured region or
// page, anchored to that location. Used by pdf-reader.tsx (toolbar and shortcuts).
import type { Dispatch, SetStateAction } from "react";
import type { useRouter } from "next/navigation";
import type { useTranslations } from "next-intl";
import type { useDeadlineCreator } from "@/modules/tasks/components/deadline-create-provider";
import type { useTaskCreator } from "@/modules/tasks/components/task-create-provider";
import type { PdfRect } from "../../lib/pdf-evidence";
import type { ReaderSelection, SelectionAnchor } from "./pdf-reader-types";

export function createPdfContextRequests({
  selection, region, pageNumber, documentId, sourceId, sourceTitle, t, openTaskCreator, openDeadlineCreator,
  setSelection, setRegion, setSelectionAnchor, router,
}: {
  selection: ReaderSelection | null;
  region: PdfRect | null;
  pageNumber: number;
  documentId: string;
  sourceId: string;
  sourceTitle: string;
  t: ReturnType<typeof useTranslations<"wiki">>;
  openTaskCreator: ReturnType<typeof useTaskCreator>["openTaskCreator"];
  openDeadlineCreator: ReturnType<typeof useDeadlineCreator>["openDeadlineCreator"];
  setSelection: Dispatch<SetStateAction<ReaderSelection | null>>;
  setRegion: Dispatch<SetStateAction<PdfRect | null>>;
  setSelectionAnchor: Dispatch<SetStateAction<SelectionAnchor | null>>;
  router: ReturnType<typeof useRouter>;
}) {
  function requestPdfTask() {
    const selected = selection;
    const selectedRegion = region;
    const taskPage = selected?.pageNumber ?? pageNumber;
    const rects = selected?.rects ?? (selectedRegion ? [selectedRegion] : []);
    const quote = selected?.text.trim() ?? "";
    openTaskCreator({
      initialTitle: quote,
      origin: {
        type: "pdf",
        entityId: documentId,
        route: `/wiki/sources/${sourceId}/read/${documentId}?page=${taskPage}`,
        label: `${sourceTitle} · ${t("pageNumber", { page: taskPage })}`,
        anchor: { pageNumber: taskPage, quote, rects },
      },
      onCreated: () => {
        setSelection(null);
        setRegion(null);
        setSelectionAnchor(null);
        router.refresh();
      },
    });
  }

  function requestPdfDeadline() {
    const selected = selection;
    const selectedRegion = region;
    const deadlinePage = selected?.pageNumber ?? pageNumber;
    const rects = selected?.rects ?? (selectedRegion ? [selectedRegion] : []);
    const quote = selected?.text.trim() ?? "";
    openDeadlineCreator({
      initialTitle: quote,
      origin: {
        type: "pdf",
        entityId: documentId,
        route: `/wiki/sources/${sourceId}/read/${documentId}?page=${deadlinePage}`,
        label: `${sourceTitle} · ${t("pageNumber", { page: deadlinePage })}`,
        anchor: { pageNumber: deadlinePage, quote, rects },
      },
      onCreated: () => {
        setSelection(null);
        setRegion(null);
        setSelectionAnchor(null);
        router.refresh();
      },
    });
  }

  return { requestPdfTask, requestPdfDeadline };
}
