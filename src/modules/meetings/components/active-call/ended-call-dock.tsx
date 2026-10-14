"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { callPath, dockClass, type EndedCall } from "./active-call-types";

/** Says that the call ended while the person was on another page. */
export function EndedCallDock({ ended, onDismiss }: { ended: EndedCall; onDismiss: () => void }) {
  const t = useTranslations("meetings");
  const message = ended.reason === "closed" ? t("call.closed") : ended.reason === "failed" ? t("call.connectionFailed")
    : ended.reason === "idle" ? t("call.dock.idleEnded") : t("call.left");
  return (
    <section className={dockClass} aria-label={t("call.dock.label")} role="status">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{ended.title}</p>
          <p className="text-xs text-muted-foreground">{message}</p>
        </div>
        <Button size="icon-sm" variant="ghost" onClick={onDismiss} aria-label={t("call.dock.dismiss")}><X /></Button>
      </div>
      {/* The call page offers rejoining; a closed call is gone, so that leads to the meeting instead. */}
      <Link href={ended.reason === "closed" ? `/meetings/${ended.meetingId}` : callPath(ended.meetingId)} className={buttonVariants({ size: "sm", variant: "outline" })}>
        {ended.reason === "closed" ? t("call.backToMeeting") : t("call.rejoin")}
      </Link>
    </section>
  );
}
