// Paper geometry of the wiki document canvas: page counts and positions, template variables
// and the CSS custom properties for document and note mode. Used by wiki-editor.tsx.
import type { CSSProperties } from "react";
import type { DocumentSettingsV1 } from "../../lib/document-settings";
import { wikiTypographyCssVariables, type WikiTypographySettingsV1 } from "../../lib/wiki-typography";

export function documentCanvasLayout({ documentSettings, documentPageCount, bibliographyVisible, figureIndexVisible, typography, documentZoom, pageTitle }: {
  documentSettings: DocumentSettingsV1;
  documentPageCount: number;
  bibliographyVisible: boolean;
  figureIndexVisible: boolean;
  typography: WikiTypographySettingsV1;
  documentZoom: number;
  pageTitle: string;
}) {
  const paperWidth = documentSettings.page.size === "A4" ? 210 : 215.9;
  const paperHeight = documentSettings.page.size === "A4" ? 297 : 279.4;
  const orientedPaperHeight = documentSettings.page.orientation === "portrait" ? paperHeight : paperWidth;
  const coverPageCount = documentSettings.cover.enabled ? 1 : 0;
  const bibliographyPageCount = bibliographyVisible ? 1 : 0;
  const figurePageCount = figureIndexVisible ? 1 : 0;
  const visibleDocumentPages = coverPageCount + documentPageCount + bibliographyPageCount + figurePageCount;
  const pageStackPosition = (index: number) => index * (orientedPaperHeight + 12);
  const resolveDocumentText = (value: string) => value.replace(/\{([^}]+)\}/g, (_, key: string) => key === "title" ? pageTitle : documentSettings.variables[key] ?? `{${key}}`);
  const documentCanvasStyle = {
    ...wikiTypographyCssVariables(typography),
    "--document-paper-width": `${documentSettings.page.orientation === "portrait" ? paperWidth : paperHeight}mm`,
    "--figure-available-height": `${orientedPaperHeight - documentSettings.page.marginsMm.top - documentSettings.page.marginsMm.bottom - 18}mm`,
    "--document-paper-height": `${documentSettings.page.orientation === "portrait" ? paperHeight : paperWidth}mm`,
    "--document-margin-top": `${documentSettings.page.marginsMm.top}mm`,
    "--document-margin-right": `${documentSettings.page.marginsMm.right}mm`,
    "--document-margin-bottom": `${documentSettings.page.marginsMm.bottom}mm`,
    "--document-margin-left": `${documentSettings.page.marginsMm.left}mm`,
    "--document-page-gap": "12mm",
    "--document-content-pages": String(documentPageCount),
    "--document-page-count": String(visibleDocumentPages),
    "--document-content-stack-height": `${documentPageCount * (documentSettings.page.orientation === "portrait" ? paperHeight : paperWidth) + Math.max(0, documentPageCount - 1) * 12}mm`,
    "--document-content-offset": `${coverPageCount ? orientedPaperHeight + 12 : 0}mm`,
    "--document-bibliography-top": `${pageStackPosition(coverPageCount + documentPageCount)}mm`,
    "--document-figure-index-top": `${pageStackPosition(coverPageCount + documentPageCount + bibliographyPageCount)}mm`,
    "--document-table-index-top": pageStackPosition(coverPageCount + documentPageCount + bibliographyPageCount + figurePageCount) + "mm",
    "--document-stack-height": `${visibleDocumentPages * orientedPaperHeight + Math.max(0, visibleDocumentPages - 1) * 12}mm`,
    zoom: documentZoom / 100,
  } as CSSProperties;
  const editorTypographyStyle = {
    ...wikiTypographyCssVariables(typography),
    zoom: documentZoom / 100,
  } as CSSProperties;
  return { coverPageCount, visibleDocumentPages, pageStackPosition, resolveDocumentText, documentCanvasStyle, editorTypographyStyle };
}
