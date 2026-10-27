"use client";

// One calendar with a colour-filled checkbox and an options menu (show only this, edit;
// sync now and remove for subscriptions; sync now, start and stop Nextcloud sync).
// Used by calendar-list-section.tsx.
import { Check, MoreHorizontal, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { UserIdentity } from "@/components/user-identity";
import { cn } from "@/lib/utils";
import type { CalendarEntry, CalendarT } from "./sidebar-types";
import { SubscriptionStatus } from "./subscription-status";

export function CalendarRow({
  t,
  calendar,
  checked,
  dense,
  showOwner,
  onToggle,
  onOnly,
  onEdit,
  onSync,
  onRemove,
  onPushToNextcloud,
  onUnlinkNextcloud,
}: {
  t: CalendarT;
  calendar: CalendarEntry;
  checked: boolean;
  dense?: boolean;
  showOwner?: boolean;
  onToggle: () => void;
  onOnly: () => void;
  onEdit: () => void;
  onSync?: () => void;
  onRemove?: () => void;
  onPushToNextcloud?: () => void;
  onUnlinkNextcloud?: () => void;
}) {
  const owner = calendar.role === "owner";
  const manageSubscription = owner && calendar.subscription;
  const sync = calendar.subscription ?? (calendar.nextcloud && { host: "Nextcloud", ...calendar.nextcloud });
  return (
    <div className={cn("group flex items-center gap-1 rounded-md transition-colors hover:bg-accent", !dense && "border pr-2")}>
      <label
        className={cn(
          "flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-md focus-within:ring-2 focus-within:ring-ring",
          dense ? "min-h-8 px-2 py-1" : "px-3 py-3",
        )}
      >
        <input type="checkbox" className="sr-only" aria-label={calendar.name} checked={checked} onChange={onToggle} />
        <span
          aria-hidden
          className="grid size-3.5 shrink-0 place-items-center rounded-[4px] border-[1.5px] text-white"
          style={{ borderColor: calendar.color, backgroundColor: checked ? calendar.color : "transparent" }}
        >
          {checked && <Check className="size-2.5" strokeWidth={3} />}
        </span>
        <span className="min-w-0">
          <span className={cn("flex items-center gap-1.5 leading-snug", dense ? "text-[13px]" : "text-sm font-medium")}>
            <span className="truncate">{calendar.name}</span>
            {dense && sync && <SubscriptionStatus t={t} subscription={sync} compact />}
          </span>
          {showOwner && <UserIdentity userId={calendar.ownerId} compact className="text-xs text-muted-foreground" />}
          {!dense && sync && <SubscriptionStatus t={t} subscription={sync} />}
        </span>
      </label>
      <DropdownMenu>
        <ShortcutTooltip label={t("calendarActions", { name: calendar.name })} hint={t("hintCalendarActions")} side="right">
          <DropdownMenuTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t("calendarActions", { name: calendar.name })}
                className={cn(dense && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[popup-open]:opacity-100")}
              />
            }
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
        </ShortcutTooltip>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuItem onClick={onOnly}>{t("onlyCalendar", { name: calendar.name })}</DropdownMenuItem>
          {calendar.role === "owner" && <DropdownMenuItem onClick={onEdit}>{t("editCalendar")}</DropdownMenuItem>}
          {(manageSubscription || (owner && calendar.nextcloud)) && onSync && <DropdownMenuItem onClick={onSync}><RefreshCw />{t("feeds.syncNow")}</DropdownMenuItem>}
          {owner && !calendar.subscription && !calendar.nextcloud && onPushToNextcloud && (
            <DropdownMenuItem onClick={onPushToNextcloud}>{t("nextcloud.push")}</DropdownMenuItem>
          )}
          {owner && calendar.nextcloud && onUnlinkNextcloud && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onUnlinkNextcloud}>{t("nextcloud.unlink")}</DropdownMenuItem>
            </>
          )}
          {manageSubscription && onRemove && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onRemove}>{t("feeds.remove")}</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
