import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { listNotifications } from "@/modules/wiki/research-queries";
import { MarkAllReadButton } from "@/modules/wiki/components/collection-actions";
import { NotificationList } from "@/modules/wiki/components/notification-list";
import { WIKI_PAGE_CLASS } from "@/modules/wiki/components/wiki-page-class";
import { PageHeader } from "@/components/page-header";

export default async function NotificationsPage() {
  const currentUser = await requireUser();
  const t = await getTranslations("wiki");
  const items = listNotifications(currentUser.id);
  return <div className={WIKI_PAGE_CLASS}>
    <PageHeader eyebrow={t("teamActivity")} title={t("notifications")} actions={<MarkAllReadButton />} />
    <div className="overflow-hidden rounded-xl border bg-card shadow-card"><NotificationList items={items} /></div>
  </div>;
}
