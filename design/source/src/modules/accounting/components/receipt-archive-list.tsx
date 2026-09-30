"use client";

import { useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { ChevronDown, Paperclip } from "lucide-react";
import { UserAttribution } from "@/components/user-identity";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

export type ReceiptArchiveItem = {
  id: string;
  fileName: string;
  sizeBytes: number;
  uploadedBy: string | null;
  entryKind: string;
  entryDate: string;
  description: string;
  counterparty: string | null;
  categoryName: string;
  grossAmountCents: number;
};

const COLLAPSED_COUNT = 10;

function formatFileSize(bytes: number, locale: string) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} ${unit}`;
}

export function ReceiptArchiveList({ receipts }: { receipts: ReceiptArchiveItem[] }) {
  const t = useTranslations("documents");
  const tAccounting = useTranslations("accounting");
  const locale = useLocale();
  const format = useFormatter();
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? receipts : receipts.slice(0, COLLAPSED_COUNT);
  const hidden = receipts.length - visible.length;

  return (
    <>
      <ul className="divide-y">
        {visible.map((receipt) => {
          const title = receipt.counterparty?.trim() || receipt.description;
          const showDescription =
            !!receipt.counterparty?.trim() && receipt.description.trim() !== "" &&
            receipt.description !== receipt.counterparty;
          return (
            <li key={receipt.id} className="group relative px-4 py-3 transition-colors hover:bg-muted/40">
              <div className="flex min-w-0 items-start gap-3">
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background">
                  <Paperclip className="size-3.5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-baseline justify-between gap-3">
                    <a
                      href={`/api/files/${receipt.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 truncate font-medium after:absolute after:inset-0 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                      aria-label={t("receiptFor", { description: receipt.description })}
                      title={receipt.fileName}
                    >
                      {title}
                    </a>
                    <span
                      className={cn(
                        "shrink-0 text-sm font-semibold tabular-nums",
                        receipt.entryKind === "income" && "text-green-700 dark:text-green-500",
                      )}
                    >
                      {formatCents(receipt.grossAmountCents, locale)}
                    </span>
                  </div>
                  {showDescription ? (
                    <p className="truncate text-sm text-muted-foreground">{receipt.description}</p>
                  ) : null}
                  <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
                    <span>
                      {format.dateTime(new Date(receipt.entryDate), {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </span>
                    <span aria-hidden>·</span>
                    <span>{receipt.categoryName}</span>
                    <span aria-hidden>·</span>
                    <span>
                      {receipt.entryKind === "income"
                        ? tAccounting("income")
                        : tAccounting("expense")}
                    </span>
                  </div>
                  <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground/80">
                    <span className="max-w-full truncate">{receipt.fileName}</span>
                    <span aria-hidden>·</span>
                    <span title={t("fileSize")}>{formatFileSize(receipt.sizeBytes, locale)}</span>
                    <UserAttribution
                      userId={receipt.uploadedBy}
                      relation="uploadedBy"
                      className="relative z-10 text-[11px]"
                    />
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {receipts.length > COLLAPSED_COUNT ? (
        <div className="border-t p-2">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {expanded ? t("showFewerReceipts") : t("showAllReceipts", { count: hidden })}
            <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
          </button>
        </div>
      ) : null}
    </>
  );
}
