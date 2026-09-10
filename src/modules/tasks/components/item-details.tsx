"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function ItemDetails({ title, description, origin, href, fields, children, className, onEdit }: {
  title: string; description?: string | null; origin: string; href: string | null;
  fields: Array<{ label: string; value: ReactNode }>;
  children: ReactNode; className?: string; onEdit?: () => void;
}) {
  const t = useTranslations("overviewDetails");
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger className={`cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-ring ${className ?? ""}`} aria-label={title}>{children}</DialogTrigger>
    <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl" showCloseButton={false}>
      <DialogHeader>
        <DialogTitle className="break-words text-xl">{title}</DialogTitle>
        <DialogDescription>{t("hint")}</DialogDescription>
      </DialogHeader>
      <div className="rounded-xl border bg-muted/30 p-3">
        <p className="text-xs text-muted-foreground">{t("origin")}</p>
        <p className="break-words font-medium">{origin}</p>
      </div>
      <dl className="grid gap-4 sm:grid-cols-2">{fields.map(({label, value}) => <div key={label}>
        <dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{value}</dd>
      </div>)}</dl>
      <div><p className="mb-1 text-xs text-muted-foreground">{t("description")}</p><p className="whitespace-pre-wrap break-words">{description || t("noDescription")}</p></div>
      {!href && <p className="text-muted-foreground">{t("unavailable")}</p>}
      <DialogFooter className="flex-wrap">
        <Button variant="ghost" onClick={() => setOpen(false)}>{t("close")}</Button>
        {onEdit && <Button variant="outline" onClick={() => { setOpen(false); onEdit(); }}>{t("edit")}</Button>}
        {href && <Button nativeButton={false} render={<Link href={href} onClick={() => setOpen(false)} />}>{t("openOrigin")}<ArrowRight /></Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
