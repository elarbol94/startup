import { getFormatter, getTranslations } from "next-intl/server";
import { Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listTrash } from "@/modules/wiki/research-queries";
import { TrashList, type TrashRow } from "@/modules/wiki/components/trash-list";
export default async function TrashPage() {
  const currentUser = await requireUser();
  const t = await getTranslations("wiki");
  const format = await getFormatter();
  const items = listTrash();
  const rows: TrashRow[] = [...items.pages.map((item) => ({ ...item, type: "page" as const })), ...items.sources.map((item) => ({ ...item, type: "source" as const }))]
    .sort((a, b) => (b.deletedAt?.getTime() ?? 0) - (a.deletedAt?.getTime() ?? 0))
    .map((item) => ({ type: item.type, id: item.id, title: item.title, deletedAtLabel: item.deletedAt ? format.dateTime(item.deletedAt, { dateStyle: "medium", timeStyle: "short" }) : "" }));
  return <div className="mx-auto max-w-4xl p-5 md:p-8"><header className="mb-7 border-b pb-5"><p className="mb-1 text-xs font-semibold tracking-[0.16em] text-indigo-600 uppercase">{t("recoverableDeletion")}</p><h1 className="text-3xl font-semibold tracking-tight">{t("trash")}</h1><p className="mt-1 text-sm text-muted-foreground">{t("trashDescription")}</p></header>{rows.length ? <TrashList rows={rows} canPurge={currentUser.role === "admin"} /> : <div className="grid min-h-64 place-items-center rounded-xl border border-dashed text-center"><div><Trash2 className="mx-auto mb-2 size-8 text-indigo-300" /><p>{t("trashEmpty")}</p></div></div>}</div>;
}
