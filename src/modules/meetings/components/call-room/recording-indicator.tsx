"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/** A pulsing red dot with "Aufnahme läuft", for the call header and the video area. */
export function RecordingIndicator({ className }: { className?: string }) {
  const t = useTranslations("meetings");
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full bg-red-600 px-3 py-1 text-sm font-semibold text-white", className)} role="status">
      <span className="relative flex size-2.5" aria-hidden>
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-white opacity-75" />
        <span className="relative inline-flex size-2.5 rounded-full bg-white" />
      </span>
      {t("call.recording")}
    </span>
  );
}
