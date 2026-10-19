import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { ChatFrame } from "@/modules/chat/components/chat-frame";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("chat");
  return { title: t("title") };
}

export default async function ChatPage() {
  await requireUser();
  const t = await getTranslations("chat");
  return <ChatFrame title={t("frameTitle")} />;
}
