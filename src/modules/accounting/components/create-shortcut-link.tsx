"use client";

// The primary "Neu…" link button of a server-rendered page: shows its shortcut (N, see
// SECTION_PAGE_SHORTCUTS) in the tooltip and follows the link when the key is pressed.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip";
import { useKeyboardShortcut } from "@/components/use-keyboard-shortcut";

export function CreateShortcutLink({ href, label, shortcut }: { href: string; label: string; shortcut: string }) {
  const router = useRouter();
  useKeyboardShortcut(shortcut, () => router.push(href));
  return (
    <ShortcutTooltip label={label} shortcut={shortcut}>
      <Button nativeButton={false} render={<Link href={href} />}>
        <Plus className="size-4" />
        {label}
      </Button>
    </ShortcutTooltip>
  );
}
