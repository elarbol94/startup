"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createQuickNote } from "../research-actions";
import { requestAppNavigation } from "@/lib/app-navigation";

export function QuickNoteButton({ label }: { label?: string }) {
  const t = useTranslations("wiki"); const locale = useLocale(); const router = useRouter(); const [pending, setPending] = useState(false);
  return <Button disabled={pending} onClick={() => requestAppNavigation("/wiki/pages", async () => { setPending(true); try { const page = await createQuickNote(locale === "en" ? "en" : "de"); router.push(`/wiki/pages/${page.slug}`); } catch { toast.error(t("quickNoteFailed")); } finally { setPending(false); } })}><Plus className="size-4" />{label ?? t("quickNote")}</Button>;
}
