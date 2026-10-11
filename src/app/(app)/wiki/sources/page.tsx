import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BookMarked } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth";
import { listSourcesPage, listDocumentTypes, listTags } from "@/modules/wiki/research-queries";
import { parseTagList } from "@/modules/wiki/lib/tags";
import { PageHeader } from "@/components/page-header";
import { NewSourceDialog } from "@/modules/wiki/components/new-source-dialog";
import { SourceFilters } from "@/modules/wiki/components/source-filters";
import { LibraryTools } from "@/modules/wiki/components/library-tools";
import { MetadataLookupDialog } from "@/modules/wiki/components/metadata-lookup-dialog";
import { PdfUpload } from "@/modules/wiki/components/pdf-upload";
import { listPdfDocumentsForSources } from "@/modules/wiki/pdf-queries";
import { SourceTable, type SourceTableRow } from "@/modules/wiki/components/source-table";
import { WIKI_PAGE_CLASS } from "@/modules/wiki/components/wiki-page-class";

export default async function SourcesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; tag?: string; cursor?: string }> }) {
  const [, t, params] = await Promise.all([requireUser(), getTranslations("wiki"), searchParams]);
  const sourcePage = listSourcesPage({ query: params.q, status: params.status, tagId: params.tag, cursor: params.cursor }); const sources = sourcePage.items; const documentTypes = listDocumentTypes().map((item) => item.value); const tags = listTags();
  const pdfStatus = listPdfDocumentsForSources(sources.map((source) => source.id));
  const rows: SourceTableRow[] = sources.map((source) => {
    const documents = pdfStatus.get(source.id) ?? [];
    const primary = documents.find((document) => document.role === "primary") ?? documents[0];
    const readHref = primary?.status === "ready" ? `/wiki/sources/${source.id}/read/${primary.id}` : undefined;
    return {
      id: source.id, title: source.title, href: readHref ?? `/wiki/sources/${source.id}`, tags: parseTagList(source.tags),
      contributors: source.contributors ? source.contributors.split(",").join(", ") : "", year: source.issuedDate.slice(0, 4),
      typeLabel: t(`sourceTypes.${source.type}`), status: source.readingStatus, statusLabel: t(`readingStatuses.${source.readingStatus}`),
      pdf: primary ? (readHref ? { label: `${primary.pageCount} ${t("pagesCount")}`, href: readHref } : { label: t(`pdfStatuses.${primary.status}`), failed: primary.status === "failed" }) : null,
      citationCount: source.citationCount, attachmentCount: source.attachmentCount,
    };
  });
  return <div className={WIKI_PAGE_CLASS}><PageHeader eyebrow={t("evidenceLibrary")} title={t("sources")} description={t("sourcesDescription")} actions={<><MetadataLookupDialog documentTypes={documentTypes} /><NewSourceDialog documentTypes={documentTypes} /></>} />
    <PdfUpload dropzone />
    <div className="my-4"><LibraryTools /></div>
    <SourceFilters key={`${params.q ?? ""}:${params.status ?? ""}:${params.tag ?? ""}`} initialQuery={params.q ?? ""} initialStatus={params.status ?? ""} initialTag={params.tag ?? ""} tags={tags} />
    {sources.length === 0 ? <div className="mt-4 rounded-xl border bg-card shadow-card"><EmptyState icon={<BookMarked />} title={t("noSources")} description={t("noSourcesDescription")} /></div> :
    <SourceTable rows={rows} />}
    {sourcePage.nextCursor && <div className="mt-4 flex justify-end"><Link className={buttonVariants({ variant: "outline" })} href={`/wiki/sources?${new URLSearchParams({ ...(params.q ? { q: params.q } : {}), ...(params.status ? { status: params.status } : {}), ...(params.tag ? { tag: params.tag } : {}), cursor: sourcePage.nextCursor }).toString()}`}>{t("nextPage")}</Link></div>}
  </div>;
}
