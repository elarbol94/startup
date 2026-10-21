"use client";

// Share button for a page or item. On touch devices it opens the system share sheet (Element,
// WhatsApp, Signal, mail…); elsewhere it opens a menu to copy the link, copy it with its title
// as Markdown, hand it to the system sheet where the browser has one, or take it to Chat.
//   <ShareMenu target={{ href: canonicalTaskHref(task.id, task.projectId), title: task.title }} />
// Pass a function as `target` when the link is only known at click time (the current page).
import type { ComponentProps, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link2, MessagesSquare, Share2, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ShareTarget } from "@/lib/share-links";
import { useShareLink } from "./use-share-link";

type ButtonProps = ComponentProps<typeof Button>;

export function ShareMenu({
  target,
  label,
  variant = "outline",
  size = "icon-sm",
  className,
  children,
  align = "end",
  side,
}: {
  target: ShareTarget | (() => ShareTarget);
  /** Accessible name and tooltip; defaults to "Share". */
  label?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  /** Button content; an icon by default. */
  children?: ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
}) {
  const t = useTranslations("share");
  const share = useShareLink();
  const name = label ?? t("share");
  const resolve = () => (typeof target === "function" ? target() : target);
  const content = children ?? <Share2 className="size-4" />;

  if (share.nativeFirst) {
    return (
      <Button type="button" variant={variant} size={size} className={className} aria-label={name} title={name} onClick={() => void share.shareNatively(resolve())}>
        {content}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" variant={variant} size={size} className={className} aria-label={name} title={name} />}>
        {content}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side} className="w-60">
        <DropdownMenuItem onClick={() => void share.copyLink(resolve())}>
          <Link2 className="mr-2 size-4" />
          {t("copyLink")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void share.copyTitledLink(resolve())}>
          <Type className="mr-2 size-4" />
          {t("copyTitledLink")}
        </DropdownMenuItem>
        {share.canNativeShare && (
          <DropdownMenuItem onClick={() => void share.shareNatively(resolve())}>
            <Share2 className="mr-2 size-4" />
            {t("shareVia")}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void share.shareInChat(resolve())}>
          <MessagesSquare className="mr-2 size-4" />
          {t("shareInChat")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
