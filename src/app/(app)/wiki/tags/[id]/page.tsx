import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { FileText, Hash, LibraryBig } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { getResearchNavigation, listByTag } from "@/modules/wiki/research-queries";
import { TagAdminActions } from "@/modules/wiki/components/tag-admin-actions";
import { WIKI_PAGE_CLASS } from "@/modules/wiki/components/wiki-page-class";

function TagSection({ title, icon: Icon, items, empty }: {
  title: string;
  icon: typeof FileText;
  items: Array<{ id: string; title: string; href: string }>;
  empty: string;
}) {
  return <section className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-card">
    <header className="flex min-h-[52px] items-center gap-2.5 border-b border-line-soft px-[18px] py-2.5">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <h2 className="text-sm font-semibold">{title}</h2>
      <span className="text-xs text-muted-foreground tabular-nums">{items.length}</span>
    </header>
    {items.length ? <ul className="divide-y divide-line-soft">{items.map((item) => <li key={item.id}>
      <Link href={item.href} className="flex items-center gap-3 px-[18px] py-[11px] text-[13.5px] transition-colors outline-none hover:bg-accent focus-visible:bg-accent">
        <Icon className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 truncate font-medium">{item.title}</span>
      </Link>
    </li>)}</ul> : <p className="px-[18px] py-[11px] text-[13px] text-muted-foreground">{empty}</p>}
  </section>;
}

export default async function TagPage({ params }: { params: Promise<{ id: string }> }) {
  const currentUser = await requireUser();
  const t = await getTranslations("wiki");
  const { id } = await params;
  const data = listByTag(id);
  if (!data) notFound();
  const tags = getResearchNavigation(currentUser.id).tags;
  return <div className={WIKI_PAGE_CLASS}>
    <PageHeader
      eyebrow={t("tagView")}
      title={<span className="inline-flex items-center gap-2"><Hash className="size-6 shrink-0 text-muted-foreground" />{data.tag.name}</span>}
      actions={currentUser.role === "admin" ? <TagAdminActions tag={data.tag} tags={tags} /> : undefined}
    />
    <div className="grid items-start gap-4 md:grid-cols-2">
      <TagSection title={t("documents")} icon={FileText} empty={t("workspace.empty")} items={data.pages.map((page) => ({ id: page.id, title: page.title, href: `/wiki/pages/${page.slug}` }))} />
      <TagSection title={t("sources")} icon={LibraryBig} empty={t("workspace.empty")} items={data.sources.map((source) => ({ id: source.id, title: source.title, href: `/wiki/sources/${source.id}` }))} />
    </div>
  </div>;
}
