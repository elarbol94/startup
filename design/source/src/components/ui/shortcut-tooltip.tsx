"use client";

// Hover/focus tooltip that shows a control's label and its keyboard shortcut. Wrap any single
// focusable element (including Base UI triggers rendered through `render`):
//   <ShortcutTooltip label={t("today")} shortcut="T"><Button …/></ShortcutTooltip>
// The shortcut itself is registered separately with useKeyboardShortcut.
import { Fragment, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { shortcutDisplayKeys } from "@/lib/shortcuts";

const noopSubscribe = () => () => {};
const detectMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function useIsMacPlatform() {
  return useSyncExternalStore(noopSubscribe, detectMac, () => false);
}

export function ShortcutKeys({ shortcut, className }: { shortcut: string; className?: string }) {
  const t = useTranslations("shortcuts");
  const mac = useIsMacPlatform();
  const steps = shortcutDisplayKeys(shortcut, { mac, labels: { ctrl: t("ctrl") } });
  return (
    <KbdGroup className={className}>
      {steps.map((keys, index) => (
        <Fragment key={index}>
          {index > 0 && <span className="text-[10px] opacity-70">{t("then")}</span>}
          {keys.map((key) => <Kbd key={key}>{key}</Kbd>)}
        </Fragment>
      ))}
    </KbdGroup>
  );
}

export function ShortcutTooltip({
  label,
  shortcut,
  children,
  side = "bottom",
  disabled,
}: {
  label: React.ReactNode;
  shortcut?: string;
  children: React.ReactElement;
  side?: "top" | "bottom" | "left" | "right";
  disabled?: boolean;
}) {
  return (
    <Tooltip disabled={disabled}>
      <TooltipTrigger delay={400} render={children} />
      <TooltipContent side={side}>
        {label}
        {shortcut && <ShortcutKeys shortcut={shortcut} />}
      </TooltipContent>
    </Tooltip>
  );
}
