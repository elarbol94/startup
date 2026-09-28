"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { EllipsisVertical, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function SourceListActions({ sourceId, title, onTrash }: { sourceId: string; title: string; onTrash: () => void }) {
  const t = useTranslations("wiki");
  const tCommon = useTranslations("common");
  return <DropdownMenu>
    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={tCommon("more", { name: title })} />}><EllipsisVertical className="size-4" /></DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem render={<Link href={`/wiki/sources/${sourceId}`} />}><Pencil />{t("edit")}</DropdownMenuItem>
      <DropdownMenuItem variant="destructive" onClick={onTrash}><Trash2 />{tCommon("moveToTrash")}</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
