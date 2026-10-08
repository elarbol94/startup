"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Keeps the upload form behind a button so the recordings come first. Once
 * opened, or while an upload is running or reporting, the form stays open.
 */
export function UploadDisclosure({ keepOpen, children }: { keepOpen: boolean; children: React.ReactNode }) {
  const t = useTranslations("meetings");
  const [open, setOpen] = useState(false);
  if (open || keepOpen) return children;
  return <Button variant="outline" onClick={() => setOpen(true)}><Upload />{t("recordings.uploadTitle")}</Button>;
}
