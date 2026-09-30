"use client";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuickNoteCreator } from "./use-quick-note-creator";

export function QuickNoteButton({ label }: { label?: string }) {
  const t = useTranslations("wiki"); const { dialog, create, creating } = useQuickNoteCreator();
  return <><Button disabled={creating} onClick={() => void create()}><Plus className="size-4" />{label ?? t("quickNote")}</Button>{dialog}</>;
}
