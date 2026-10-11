import { getFormatter, getTranslations } from "next-intl/server";
import { Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { listTrash } from "@/modules/wiki/research-queries";
import { TrashList, type TrashRow } from "@/modules/wiki/components/trash-list";
import { WIKI_PAGE_CLASS } from "@/modules/wiki/components/wiki-page-class";

export default async function TrashPage() {
  const currentUser = await requireUser();
  const t = await getTranslations("wiki");
  const format = await getFormatter();
  const items = listTrash();
  const rows: TrashRow[] = [...items.pages.map((item) => ({ ...item, type: "page" as const })), ...items.sources.map((item) => ({ ...item, type: "source" as const }))]
    .sort((a, b) => (b.deletedAt?.getTime() ?? 0) - (a.deletedAt?.getTime() ?? 0))
    .map((item) => ({ type: item.type, id: item.id, title: item.title, deletedAtLabel: item.deletedAt ? format.dateTime(item.deletedAt, { dateStyle: "medium", timeStyle: "short" }) : "" }));
  return <div className={WIKI_PAGE_CLASS}>
    <PageHeader eyebrow={t("recoverableDeletion")} title={t("trash")} description={t("trashDescription")} />
    {rows.length
      ? <TrashList rows={rows} canPurge={currentUser.role === "admin"} />
      : <div className="rounded-xl border bg-card shadow-card"><EmptyState icon={<Trash2 />} title={t("trashEmpty")} /></div>}
  </div>;
}
