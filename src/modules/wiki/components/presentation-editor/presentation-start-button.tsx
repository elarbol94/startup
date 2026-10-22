"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronDown, MonitorPlay, Play, Scan } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** Primary action follows the deck's saved mode; the adjacent menu overrides it for one
 * launch. All links pass through the editor's pending-save boundary, including new tabs. */
export function PresentationStartButton({ href, ribbon, fromCurrent, disabled, startMode, leaveVia, auxFlush }: {
  href: string;
  ribbon: boolean;
  fromCurrent: boolean;
  disabled: boolean;
  startMode: "path" | "free";
  leaveVia: (event: MouseEvent, href: string) => void;
  auxFlush: (event: MouseEvent, href: string) => void;
}) {
  const t = useTranslations("wiki");
  const primary = <Button type="button" size="sm" variant={ribbon ? "ghost" : "default"} disabled={disabled} nativeButton={false} role="link"
    className={ribbon ? "h-[70px] flex-col justify-start gap-1 px-2 pt-1.5 text-xs font-normal [&_svg]:size-6!" : "rounded-r-none"}
    title={fromCurrent ? t("presentations.ribbon.fromCurrentTip") : t(`presentations.startModeHints.${startMode}`)}
    render={<Link href={href} onClick={event => leaveVia(event, href)} onAuxClick={event => auxFlush(event, href)} />}>
    {fromCurrent ? <MonitorPlay className="size-3.5" /> : <Play className="size-3.5" />}
    {fromCurrent ? t("presentations.ribbon.fromCurrent") : ribbon ? t(startMode === "free" ? "presentations.startModes.free" : "presentations.ribbon.fromStart") : t("presentations.present")}
  </Button>;
  if (fromCurrent) return primary;
  return <div className="inline-flex shrink-0 items-start" data-testid="presentation-start">
    {primary}
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" size="sm" variant={ribbon ? "ghost" : "default"} disabled={disabled}
        className={ribbon ? "h-[70px] w-6 px-0" : "w-7 rounded-l-none border-l border-background/20 px-0"}
        aria-label={t("presentations.startOptions")} data-testid="presentation-start-options" />}>
        <ChevronDown className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {(["path", "free"] as const).map(mode => {
          const target = href + (href.includes("?") ? "&" : "?") + "mode=" + mode;
          return <DropdownMenuItem key={mode} className="items-start"
            render={<Link href={target} onClick={event => leaveVia(event, target)} onAuxClick={event => auxFlush(event, target)} />}>
            {mode === "path" ? <Play className="mt-0.5 size-4" /> : <Scan className="mt-0.5 size-4" />}
            <span className="min-w-0"><span className="block">{t(`presentations.startModes.${mode}`)}</span>
              <span className="block text-xs text-muted-foreground">{t(`presentations.startModeHints.${mode}`)}</span></span>
          </DropdownMenuItem>;
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  </div>;
}
