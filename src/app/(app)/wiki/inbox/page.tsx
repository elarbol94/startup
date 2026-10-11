import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { listWorkspacePages } from "@/modules/wiki/research-queries";
import { QuickNoteButton } from "@/modules/wiki/components/workspace-actions";
import { WorkspacePageList } from "@/modules/wiki/components/workspace-page-list";
import { WIKI_PAGE_CLASS } from "@/modules/wiki/components/wiki-page-class";

export default async function InboxPage() {
  const currentUser = await requireUser();
  const t = await getTranslations("wiki");
  const pages = listWorkspacePages(currentUser.id);
  return (
    <div className={WIKI_PAGE_CLASS}>
      <PageHeader
        eyebrow={t("captureAndTriage")}
        title={t("notesWorkspace")}
        description={t("notesWorkspaceDescription")}
        actions={<QuickNoteButton />}
      />
      <WorkspacePageList pages={pages} />
    </div>
  );
}
