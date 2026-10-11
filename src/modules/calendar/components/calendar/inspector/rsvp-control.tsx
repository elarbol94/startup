"use client";

// Segmented accept / maybe / decline control for the current user's invitation.
// Responses are stored per event, so a reply applies to the whole series.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, CircleHelp, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { respondToCalendarEvent } from "../../../actions";
import type { CalendarResponse } from "../../../types";

type Reply = Exclude<CalendarResponse, "needs_action">;

const OPTIONS = [
  { value: "accepted", label: "inspectorRsvpAccept", Icon: Check, active: "bg-brand text-brand-on shadow-sm" },
  { value: "tentative", label: "inspectorRsvpTentative", Icon: CircleHelp, active: "bg-amber-500 text-white shadow-sm" },
  { value: "declined", label: "inspectorRsvpDecline", Icon: X, active: "bg-destructive text-white shadow-sm" },
] as const satisfies readonly { value: Reply; label: string; Icon: unknown; active: string }[];

export function RsvpControl({
  eventId,
  response,
  recurring,
}: {
  eventId: string;
  response: CalendarResponse;
  recurring: boolean;
}) {
  const t = useTranslations("calendar");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Optimistic value, reset whenever the server-provided response (or event) changes.
  const [optimistic, setOptimistic] = useState({ key: `${eventId}:${response}`, value: response });
  const current = optimistic.key === `${eventId}:${response}` ? optimistic.value : response;

  function respond(next: Reply) {
    if (next === current || pending) return;
    const previous = current;
    setOptimistic({ key: `${eventId}:${response}`, value: next });
    startTransition(async () => {
      try {
        await respondToCalendarEvent({ eventId, response: next });
        router.refresh();
      } catch {
        setOptimistic({ key: `${eventId}:${response}`, value: previous });
        toast.error(t("inspectorRsvpError"));
      }
    });
  }

  return (
    <div className="space-y-1.5 border-t border-line-soft pt-3">
      <p id={`rsvp-${eventId}`} className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-tertiary">
        {t("inspectorRsvpLabel")}
      </p>
      <div
        role="group"
        aria-labelledby={`rsvp-${eventId}`}
        aria-busy={pending || undefined}
        className="grid grid-cols-3 gap-0.5 rounded-[10px] border bg-muted p-[3px]"
      >
        {OPTIONS.map(({ value, label, Icon, active }) => {
          const selected = current === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={selected}
              disabled={pending && !selected}
              onClick={() => respond(value)}
              className={cn(
                "inline-flex h-[26px] items-center justify-center gap-1 rounded-[7px] px-2 text-[12.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 max-md:h-9",
                selected ? active : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              {t(label)}
            </button>
          );
        })}
      </div>
      {recurring && <p className="text-[11px] text-muted-foreground">{t("inspectorRsvpSeriesHint")}</p>}
    </div>
  );
}
