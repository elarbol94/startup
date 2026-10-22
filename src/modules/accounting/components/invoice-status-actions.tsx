"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Ban, Check, Send } from "lucide-react";
import { setInvoiceStatus } from "@/modules/accounting/invoice-actions";
import { toLocalIsoDate } from "@/modules/accounting/lib/date";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function InvoiceStatusActions({
  id,
  status,
}: {
  id: string;
  status: "draft" | "sent" | "paid" | "canceled";
}) {
  const t = useTranslations("invoices");
  const tCommon = useTranslations("common");
  const [pending, setPending] = useState(false);
  const [paidOn, setPaidOn] = useState(() => toLocalIsoDate());

  async function transition(next: "sent" | "paid" | "canceled") {
    setPending(true);
    try {
      await setInvoiceStatus(id, next, next === "paid" ? paidOn : undefined);
      toast.success(tCommon("saved"));
      window.location.reload();
    } catch {
      toast.error(tCommon("error"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "draft" && (
        <Button size="sm" disabled={pending} onClick={() => transition("sent")}>
          <Send className="size-4" />
          {t("markSent")}
        </Button>
      )}
      {status === "sent" && (
        <>
          <label className="flex items-center gap-2 text-sm">
            {t("paidOn")}
            <Input
              type="date"
              className="h-8 w-auto"
              value={paidOn}
              onChange={(e) => setPaidOn(e.target.value)}
              required
            />
          </label>
          <Button
            size="sm"
            disabled={pending || !paidOn}
            title={t("markPaidHint")}
            onClick={() => transition("paid")}
          >
            <Check className="size-4" />
            {t("markPaid")}
          </Button>
        </>
      )}
      {(status === "draft" || status === "sent") && (
        <Button
          variant="destructive"
          size="sm"
          disabled={pending}
          onClick={() => transition("canceled")}
        >
          <Ban className="size-4" />
          {t("cancel")}
        </Button>
      )}
    </div>
  );
}
