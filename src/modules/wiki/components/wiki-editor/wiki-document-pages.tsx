"use client";
// Paper chrome drawn around the wiki editor in document mode: page sheets, cover, running
// headers/footers, and the bibliography and figure/table indexes. Used by wiki-editor.tsx.
import { useTranslations } from "next-intl";
import type { formatBibliography } from "../../lib/citations";
import type { DocumentSettingsV1 } from "../../lib/document-settings";
import type { FigureCaption, SourceRef, TableCaption } from "./wiki-editor-types";

/** Everything painted before the editor content: sheets, cover and per-page header/footer. */
export function DocumentFrontMatter({ documentMode, documentSettings, pageTitle, visibleDocumentPages, documentPageCount, coverPageCount, pageStackPosition, resolveDocumentText }: {
  documentMode: boolean;
  documentSettings: DocumentSettingsV1;
  pageTitle: string;
  visibleDocumentPages: number;
  documentPageCount: number;
  coverPageCount: number;
  pageStackPosition: (index: number) => number;
  resolveDocumentText: (value: string) => string;
}) {
  const t = useTranslations("wiki");
  return <>
  {documentMode && Array.from({ length: visibleDocumentPages }, (_, index) => <div key={index} className="wiki-document-page-sheet" style={{ top: `calc(${index} * (var(--document-paper-height) + var(--document-page-gap)))` }} aria-hidden="true" />)}
  {documentMode && documentSettings.cover.enabled && <section className="wiki-document-cover" aria-label={t("document.cover")}>
    <p>{documentSettings.cover.eyebrow}</p>
    <h1>{pageTitle}</h1>
    {documentSettings.cover.subtitle && <h2>{resolveDocumentText(documentSettings.cover.subtitle)}</h2>}
    <dl>
      {(documentSettings.cover.author || documentSettings.metadata.author) && <div><dt>{t("document.author")}</dt><dd>{resolveDocumentText(documentSettings.cover.author || documentSettings.metadata.author)}</dd></div>}
      {documentSettings.cover.organization && <div><dt>{t("document.organization")}</dt><dd>{resolveDocumentText(documentSettings.cover.organization)}</dd></div>}
      {(documentSettings.cover.date || documentSettings.variables.date) && <div><dt>{t("document.date")}</dt><dd>{resolveDocumentText(documentSettings.cover.date || documentSettings.variables.date)}</dd></div>}
    </dl>
  </section>}
  {documentMode && Array.from({ length: documentPageCount }, (_, index) => {
    const pageNumber = documentSettings.footer.pageNumberStart + index;
    const top = pageStackPosition(coverPageCount + index);
    return <div key={`chrome-${index}`} className="wiki-document-page-chrome" style={{ top: `${top}mm` }} aria-hidden="true">
      {documentSettings.header.enabled && <header><span>{resolveDocumentText(documentSettings.header.left)}</span><span>{resolveDocumentText(documentSettings.header.center)}</span><span>{resolveDocumentText(documentSettings.header.right)}</span></header>}
      {documentSettings.footer.enabled && <footer><span>{resolveDocumentText(documentSettings.footer.left)}</span><span>{resolveDocumentText(documentSettings.footer.center)}</span><span>{resolveDocumentText(documentSettings.footer.right)}</span>{documentSettings.footer.pageNumbers && <b>{pageNumber}</b>}</footer>}
    </div>;
  })}
  </>;
}

/** Back matter painted after the editor content: bibliography, figure and table indexes. */
export function DocumentBackMatter({ documentSettings, bibliography, bibliographyVisible, bibliographyHref, figureIndexVisible, figureCaptions, tableIndexVisible, tableCaptions }: {
  documentSettings: DocumentSettingsV1;
  bibliography: ReturnType<typeof formatBibliography>;
  bibliographyVisible: boolean;
  bibliographyHref: (source: SourceRef) => string;
  figureIndexVisible: boolean;
  figureCaptions: FigureCaption[];
  tableIndexVisible: boolean;
  tableCaptions: TableCaption[];
}) {
  const t = useTranslations("wiki");
  return <>
  {bibliographyVisible && <section className="wiki-document-bibliography" aria-label={documentSettings.bibliography.heading}>
    <p className="wiki-document-figure-index-kicker">IEEE</p>
    <h2>{documentSettings.bibliography.heading || t("references")}</h2>
    <ol>{bibliography.map(({ source, text }) => <li key={source.id}><a href={bibliographyHref(source)}>{text}</a></li>)}</ol>
  </section>}
  {figureIndexVisible && <section className="wiki-document-figure-index" aria-label={documentSettings.figures.heading}>
    <p className="wiki-document-figure-index-kicker">{t("document.figureIndex")}</p>
    <h2>{documentSettings.figures.heading}</h2>
    {/* A caption that already numbers itself ("Abbildung 4: …") is not numbered twice. */}
    <ol>{figureCaptions.map((figure, index) => <li key={figure.nodeId}><span>{t("document.figureNumber", { number: index + 1 })}</span><span>{figure.caption}</span></li>)}</ol>
  </section>}
  {tableIndexVisible && <section className="wiki-document-figure-index wiki-document-table-index" style={{ top: "var(--document-table-index-top)" }} aria-label={documentSettings.tables.heading}>
    <p className="wiki-document-figure-index-kicker">{t("document.tableIndex")}</p>
    <h2>{documentSettings.tables.heading}</h2>
    <ol>{tableCaptions.map((table, index) => <li key={table.tableId}><span>{t("document.tableNumber", { number: index + 1 })}</span><span>{table.caption}</span></li>)}</ol>
  </section>}
  </>;
}
