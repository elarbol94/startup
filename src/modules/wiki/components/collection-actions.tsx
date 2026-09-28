"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markNotificationsRead } from "../research-actions";
export function MarkAllReadButton() { const t = useTranslations("wiki"); const router = useRouter(); return <Button variant="outline" onClick={async () => { await markNotificationsRead(); router.refresh(); }}><CheckCheck className="size-4" />{t("markAllRead")}</Button>; }
