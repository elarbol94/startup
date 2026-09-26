"use client";
// Names the open deck for the browser tab and for the app workspace tab (which reads the
// first <h1> of the page). The visible title is the editable input in the header.
import { useEffect } from "react";
import { useTranslations } from "next-intl";

export function PresentationDocumentTitle({ title }: { title: string }) {
  const t = useTranslations("wiki.presentations");
  const documentTitle = t("documentTitle", { title });
  useEffect(() => { document.title = documentTitle; }, [documentTitle]);
  return <h1 className="sr-only">{title}</h1>;
}
