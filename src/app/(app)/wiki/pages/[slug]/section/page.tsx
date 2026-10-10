import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { getPageByPreviousSlug, getPageBySlug } from "@/modules/wiki/queries";
import { SectionEditorPage } from "@/modules/wiki/components/office/section-editor/section-editor-page";
import { isSectionLockId } from "@/modules/wiki/components/office/section-editor/section-logic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const [, { slug }, t] = await Promise.all([requireUser(), params, getTranslations("officeDocuments.sectionEditor")]);
  const page = getPageBySlug(decodeURIComponent(slug));
  // The page sets the section's title once the main document tab has sent it.
  return page ? { title: { absolute: t("tabTitle", { section: t("heading"), document: page.title }) } } : {};
}

/**
 * Section tab of "Abschnitt separat bearbeiten" (opened from the document's
 * context menu). The section itself comes from the main document tab in the
 * browser, never from the URL or the server; see docs/office-documents.md.
 */
export default async function WikiSectionPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ edit?: string | string[] }> }) {
  await connection();
  await requireUser();
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const requestedSlug = decodeURIComponent(slug);
  const lockId = typeof query.edit === "string" ? query.edit : "";
  const page = getPageBySlug(requestedSlug);
  if (!page) {
    const renamed = getPageByPreviousSlug(requestedSlug);
    if (renamed) redirect(`/wiki/pages/${encodeURIComponent(renamed.slug)}/section?edit=${encodeURIComponent(lockId)}`);
    notFound();
  }
  const documentPath = `/wiki/pages/${encodeURIComponent(page.slug)}`;
  if (page.documentEngine !== "office" || !isSectionLockId(lockId)) redirect(documentPath);
  return <SectionEditorPage key={lockId} page={{ id: page.id, title: page.title, slug: page.slug }} lockId={lockId} />;
}
