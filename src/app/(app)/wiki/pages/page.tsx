import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { listWorkspacePages } from "@/modules/wiki/research-queries";
import { PageHeader } from "@/components/page-header";
import { OfficeDocumentButton } from "@/modules/wiki/components/office/office-document-button";
import { PageTreeList } from "@/modules/wiki/components/page-tree-list";
import { WIKI_PAGE_CLASS } from "@/modules/wiki/components/wiki-page-class";

export default async function PagesIndex() {
  const currentUser = await requireUser();
  const t = await getTranslations("wiki");
  const pages = listWorkspacePages(currentUser.id);
  return <div className={WIKI_PAGE_CLASS}>
    <PageHeader title={t("documents")} description={t("documentsDescription")} actions={<OfficeDocumentButton />} />
    <PageTreeList pages={pages} />
  </div>;
}
