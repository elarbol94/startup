import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { listNotifications } from "@/modules/wiki/research-queries";
import { MarkAllReadButton } from "@/modules/wiki/components/collection-actions";
import { NotificationList } from "@/modules/wiki/components/notification-list";

export default async function NotificationsPage() {
  const currentUser = await requireUser();
  const t = await getTranslations("wiki");
  const items = listNotifications(currentUser.id);
  return <div className="mx-auto max-w-4xl p-5 md:p-8">
    <header className="mb-7 flex flex-wrap items-end justify-between gap-3 border-b pb-5">
      <div><p className="mb-1 text-xs font-semibold tracking-[0.16em] text-indigo-600 uppercase">{t("teamActivity")}</p><h1 className="text-3xl font-semibold tracking-tight">{t("notifications")}</h1></div>
      <MarkAllReadButton />
    </header>
    <div className="overflow-hidden rounded-xl border"><NotificationList items={items} /></div>
  </div>;
}
