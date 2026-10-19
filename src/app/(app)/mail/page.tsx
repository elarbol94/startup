import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { MailClient } from "@/modules/mail/components/mail-client";
import { listMailAccounts } from "@/modules/mail/queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("mail");
  return { title: t("title") };
}

export default async function MailPage() {
  const viewer = await requireUser();
  return <MailClient initialAccounts={listMailAccounts(viewer.id)} userName={viewer.name} />;
}
