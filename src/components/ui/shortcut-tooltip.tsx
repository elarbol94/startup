"use client";

// Hover/focus tooltip that shows a control's label, its keyboard shortcut and optionally a short
// hint explaining what the control does. Wrap any single focusable element (including Base UI
// triggers rendered through `render`):
//   <ShortcutTooltip label={t("today")} shortcut="T" hint={t("todayHint")}><Button …/></ShortcutTooltip>
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
  keys,
  hint,
  children,
  side = "bottom",
  disabled,
}: {
  label: React.ReactNode;
  shortcut?: string;
  /** Custom key rendering (e.g. several alternative shortcuts) used instead of `shortcut`. */
  keys?: React.ReactNode;
  /** One short sentence shown muted under the label. */
  hint?: React.ReactNode;
  children: React.ReactElement;
  side?: "top" | "bottom" | "left" | "right";
  disabled?: boolean;
}) {
  const shown = keys ?? (shortcut ? <ShortcutKeys shortcut={shortcut} /> : null);
  return (
    <Tooltip disabled={disabled}>
      <TooltipTrigger delay={hint ? 500 : 400} render={children} />
      <TooltipContent side={side}>
        {hint ? (
          <span className="flex max-w-60 flex-col gap-1 py-0.5">
            <span className="flex items-center justify-between gap-3 font-medium">
              {label}
              {shown}
            </span>
            <span className="text-[11px] leading-snug text-background/70">{hint}</span>
          </span>
        ) : (
          <>
            {label}
            {shown}
          </>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
