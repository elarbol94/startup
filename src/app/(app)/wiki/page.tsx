import { requireUser } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import { listDocumentTypes } from "@/modules/wiki/research-queries";
import { getWikiNavigationItems } from "@/modules/wiki/navigation-queries";
import { WikiHome } from "@/modules/wiki/components/wiki-home";
import { QuickNoteButton } from "@/modules/wiki/components/workspace-actions";
import { NewSourceDialog } from "@/modules/wiki/components/new-source-dialog";

export default async function WikiIndex() {
  const [viewer, t] = await Promise.all([requireUser(), getTranslations("wiki")]);
  return <WikiHome items={getWikiNavigationItems(viewer)} actions={<>
    <QuickNoteButton label={t("writeDocument")} />
    <NewSourceDialog documentTypes={listDocumentTypes().map((item) => item.value)} label={t("addSource")} />
  </>} />;
}
