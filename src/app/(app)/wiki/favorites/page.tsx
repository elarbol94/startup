import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FileText, LibraryBig, Star } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { listFavorites } from "@/modules/wiki/research-queries";
import { WIKI_PAGE_CLASS } from "@/modules/wiki/components/wiki-page-class";

export default async function FavoritesPage() {
  const currentUser = await requireUser();
  const t = await getTranslations("wiki");
  const items = listFavorites(currentUser.id);
  return <div className={WIKI_PAGE_CLASS}>
    <PageHeader eyebrow={t("personalView")} title={t("favorites")} />
    <div className="overflow-hidden rounded-xl border bg-card shadow-card">
      {items.length ? <ul className="divide-y divide-line-soft">{items.map((item) => {
        const Icon = item.entityType === "page" ? FileText : LibraryBig;
        return <li key={`${item.entityType}-${item.entityId}`}>
          <Link
            href={item.entityType === "page" ? `/wiki/pages/${item.slug}` : `/wiki/sources/${item.entityId}`}
            className="flex items-center gap-3 px-[18px] py-[11px] text-[13.5px] transition-colors outline-none hover:bg-accent focus-visible:bg-accent"
          >
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
          </Link>
        </li>;
      })}</ul> : <EmptyState icon={<Star />} title={t("noFavorites")} />}
    </div>
  </div>;
}
