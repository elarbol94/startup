import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { listWorkspacePages } from "@/modules/wiki/research-queries";
import { QuickNoteButton } from "@/modules/wiki/components/workspace-actions";
import { PageHeader } from "@/components/page-header";
import { PageTreeList } from "@/modules/wiki/components/page-tree-list";

export default async function PagesIndex() {
  const currentUser = await requireUser();
  const t = await getTranslations("wiki");
  const pages = listWorkspacePages(currentUser.id);
  return <div className="mx-auto max-w-7xl p-5 md:p-8">
    <PageHeader title={t("documents")} description={t("documentsDescription")} actions={<QuickNoteButton label={t("writeDocument")} />} />
    <PageTreeList pages={pages} />
  </div>;
}
