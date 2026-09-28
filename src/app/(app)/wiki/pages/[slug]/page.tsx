import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { requireUser } from "@/lib/auth";
import { listAttachmentsFor } from "@/lib/files";
import { getBacklinks, getPageByPreviousSlug, getPageBySlug } from "@/modules/wiki/queries";
import { isFavoritePage } from "@/modules/wiki/research-queries";
import { LegacyPageNotice } from "@/modules/wiki/components/office/legacy-page-notice";
import { OfficeDocumentShell } from "@/modules/wiki/components/office/office-document-shell";
import { wasConverted } from "@/modules/wiki/office/queries";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const [, { slug }, t] = await Promise.all([requireUser(), params, getTranslations("officeDocuments")]);
  const page = getPageBySlug(decodeURIComponent(slug));
  // The shell keeps this in step when the document is renamed.
  return page ? { title: { absolute: t("documentTitle", { title: page.title }) } } : {};
}

export default async function WikiPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ task?: string; deadline?: string; insertEvidence?: string; officeAction?: string }> }) {
  await connection();
  const currentUser = await requireUser(); const [{ slug }, query] = await Promise.all([params, searchParams]);
  const requestedSlug = decodeURIComponent(slug);
  const page = getPageBySlug(requestedSlug);
  if (!page) {
    const renamed = getPageByPreviousSlug(requestedSlug);
    if (renamed) {
      const destination = new URL(`/wiki/pages/${encodeURIComponent(renamed.slug)}`, "https://workspace.invalid");
      for (const [key, value] of Object.entries(query)) {
        for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) destination.searchParams.append(key, item);
      }
      redirect(`${destination.pathname}${destination.search}`);
    }
    notFound();
  }
  if (page.documentEngine === "tiptap") return <LegacyPageNotice page={{ id: page.id, title: page.title }} canConvert={currentUser.role === "admin"} />;
  if (page.documentEngine === "converting") return <p className="p-8 text-center text-sm text-muted-foreground">{(await getTranslations("officeDocuments"))("converting")}</p>;
  const attachments = listAttachmentsFor("wikiPage", page.id).map((file) => ({ id: file.id, fileName: file.fileName, mimeType: file.mimeType, sizeBytes: file.sizeBytes, uploadedBy: file.uploadedBy }));
  return <OfficeDocumentShell
    page={{ id: page.id, title: page.title, slug: page.slug }}
    backlinks={getBacklinks(page.id)}
    favorite={isFavoritePage(page.id, currentUser.id)}
    converted={wasConverted(page.id)}
    proofingLanguage={page.proofingLanguage}
    attachments={attachments}
    query={{ insertEvidence: query.insertEvidence, task: query.task, deadline: query.deadline, officeAction: query.officeAction }}
  />;
}
