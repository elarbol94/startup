"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronDown, FilePlus2, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useTextPrompt } from "@/components/ui/text-prompt-dialog";
import { createOfficeDocument, importOfficeDocument } from "../../office/office-actions";

/** The one way to create a document: a blank Word (ONLYOFFICE) document or an uploaded DOCX. */
export function OfficeDocumentButton({ parentId = null }: { parentId?: string | null }) {
  const t = useTranslations("officeDocuments");
  const common = useTranslations("common");
  const locale = useLocale() === "en" ? "en" : "de";
  const router = useRouter();
  const [dialog, askText] = useTextPrompt();
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function createBlank() {
    const title = await askText({ title: t("newDocument"), description: t("newDocumentDescription"), label: t("title"), required: true, maxLength: 200, confirmLabel: common("create") });
    if (!title) return;
    setBusy(true);
    try {
      const { slug } = await createOfficeDocument({ title, parentId, locale });
      router.push(`/wiki/pages/${slug}`);
    } catch {
      toast.error(t("createFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("locale", locale);
      if (parentId) form.set("parentId", parentId);
      const result = await importOfficeDocument(form);
      if ("error" in result) { toast.error(t(`importFailed.${result.error}`)); return; }
      router.push(`/wiki/pages/${result.slug}`);
    } catch {
      toast.error(t("createFailed"));
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return <>
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" disabled={busy} />}><FilePlus2 className="size-4" />{t("newDocumentMenu")}<ChevronDown className="size-3.5" /></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={() => void createBlank()}><FilePlus2 />{t("blankDocument")}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => fileInput.current?.click()}><FileUp />{t("uploadDocx")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <input ref={fileInput} type="file" hidden accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
    {dialog}
  </>;
}
