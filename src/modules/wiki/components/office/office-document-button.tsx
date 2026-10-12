"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronDown, FilePlus2, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useTextPrompt } from "@/components/ui/text-prompt-dialog";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-limits";
import { createOfficeDocument } from "../../office/office-actions";
import type { OfficeImportError } from "../../office/import";

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
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(t("importFailed.tooLarge"));
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("locale", locale);
      if (parentId) form.set("parentId", parentId);
      // A route handler: server actions keep Next.js's 1 MB body limit.
      const response = await fetch("/api/wiki/office/import", { method: "POST", body: form });
      const result = await response.json().catch(() => null) as { slug: string } | { error: OfficeImportError | string } | null;
      if (result && "error" in result && ["tooLarge", "notDocx", "invalidDocx"].includes(result.error)) { toast.error(t(`importFailed.${result.error as OfficeImportError}`)); return; }
      if (!response.ok || !result || !("slug" in result)) throw new Error("Import failed");
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
