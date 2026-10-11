import { UserIdentity, UserAttribution } from "@/components/user-identity";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, History } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getSourceById, listDocumentTypes } from "@/modules/wiki/research-queries";
import { listAttachmentsFor } from "@/lib/files";
import { SourceForm } from "@/modules/wiki/components/source-form";
import { AttachmentPanel } from "@/modules/wiki/components/attachment-panel";
import { PdfDocumentsPanel } from "@/modules/wiki/components/pdf-documents-panel";
import { SourcePageActions } from "@/modules/wiki/components/source-page-actions";
import { formatBibliographyEntry } from "@/modules/wiki/lib/citations";
import { RestoreSourceRevisionButton } from "@/modules/wiki/components/revision-actions";
import { listPdfDocumentsForSource } from "@/modules/wiki/pdf-queries";
import { sourceTitleFromFileName } from "@/modules/wiki/lib/pdf-evidence";
import { ContextPanel } from "@/modules/context/components/context-panel";
import { WIKI_PAGE_CLASS } from "@/modules/wiki/components/wiki-page-class";
import { listEntityContext } from "@/modules/context/queries";

export default async function SourcePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser(); const t = await getTranslations("wiki"); const { id } = await params; const data = getSourceById(id); if (!data) notFound();
  const attachments = listAttachmentsFor("wikiSource", id).filter((file) => file.mimeType !== "application/pdf").map((file) => ({ id: file.id, fileName: file.fileName, mimeType: file.mimeType, sizeBytes: file.sizeBytes, uploadedBy: file.uploadedBy }));
  const pdfDocuments = listPdfDocumentsForSource(id); const documentTypes = listDocumentTypes().map((item) => item.value);
  const primaryPdf = pdfDocuments.find((document) => document.role === "primary") ?? pdfDocuments[0];
  let metadata: Record<string, string> = {};
  try { metadata = JSON.parse(primaryPdf?.metadataJson ?? "{}") as Record<string, string>; } catch {}
  const filenameTitle = primaryPdf ? sourceTitleFromFileName(primaryPdf.fileName) : "";
  const metadataDefaults = { title: data.source.title === filenameTitle ? metadata.suggestedTitle || data.source.title : data.source.title, issuedDate: data.source.issuedDate || metadata.suggestedIssuedDate || "", language: data.source.language || metadata.suggestedLanguage || "", doi: data.source.doi || metadata.suggestedDoi || "", isbn: data.source.isbn || metadata.suggestedIsbn || "", contributors: data.contributors.length ? data.contributors : metadata.suggestedAuthor ? [{ role: "author" as const, given: "", family: "", literal: metadata.suggestedAuthor }] : [] };
  const citation = formatBibliographyEntry({ ...data.source, contributors: data.contributors });
  const sourceContext = listEntityContext("wikiSource", id);
  return <div className={WIKI_PAGE_CLASS}><Link href="/wiki" className="mb-4 inline-flex items-center gap-1 rounded-md text-[13px] text-muted-foreground outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><ArrowLeft className="size-4" />{t("backToWikiStart")}</Link>
    <header className="mb-6 border-b pb-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6"><div className="min-w-0"><p className="mb-1 text-[11px] font-semibold tracking-[0.14em] text-brand-ink uppercase">{t(`sourceTypes.${data.source.type}`)}</p><h1 className="max-w-3xl text-[22px] leading-[1.2] font-semibold tracking-[-0.025em] break-words sm:text-[26px]">{data.source.title}</h1><UserAttribution userId={data.source.createdBy} relation="createdBy" /><UserAttribution userId={data.source.updatedBy} relation="updatedBy" /></div><SourcePageActions sourceId={id} sourceTitle={data.source.title} /></div><p className="mt-4 max-w-3xl border-l-2 border-line-strong pl-3 text-[13.5px] leading-relaxed text-muted-foreground">{citation}</p></header>
    <div className="mb-8"><PdfDocumentsPanel sourceId={id} documents={pdfDocuments} /></div>
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_17rem]"><SourceForm key={id} documentTypes={documentTypes} redirectTo="/wiki/sources" initial={{ ...data.source, ...metadataDefaults, tags: data.tags }} /><aside className="space-y-6"><AttachmentPanel entityType="wikiSource" entityId={id} initial={attachments} />
      <ContextPanel
        subjectType="wikiSource"
        subjectId={id}
        subjectLabel={data.source.title}
        subjectHref={`/wiki/sources/${id}`}
        compact
        title={t("usedIn")}
        initialContext={sourceContext}
      />
      <section><h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><History className="size-4 text-muted-foreground" />{t("history")}</h3><div className="space-y-2">{data.revisions.length ? data.revisions.map((revision) => <div key={revision.id} className="flex items-start justify-between gap-1 text-xs text-muted-foreground"><span><span className="font-medium text-foreground">v{revision.version}</span> · <UserIdentity userId={revision.createdBy} name={revision.createdByName} compact /><br />{revision.createdAt.toLocaleString()}</span><RestoreSourceRevisionButton revisionId={revision.id} /></div>) : <p className="text-xs text-muted-foreground">{t("noHistory")}</p>}</div></section>
    </aside></div>
  </div>;
}
