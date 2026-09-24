"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  BookOpenText,
  CalendarRange,
  FileText,
  HandCoins,
  LayoutDashboard,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { key: "overview", href: "/accounting", also: ["/accounting/report"] },
  { key: "bookings", href: "/accounting/bookings", also: [] },
  // Customers are managed from the invoices workspace.
  { key: "invoices", href: "/accounting/invoices", also: ["/accounting/customers"] },
  { key: "planning", href: "/accounting/planning", also: [] },
  { key: "funding", href: "/accounting/funding-projects", also: [] },
] as const;

const icons = {
  overview: LayoutDashboard,
  bookings: BookOpenText,
  invoices: FileText,
  planning: CalendarRange,
  funding: HandCoins,
} as const;

function matches(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Picks exactly one active tab: the item with the longest href that matches
 * the current path segment-wise, so "/accounting" only wins on the overview
 * and "/accounting/planning" never lights up "Buchungen".
 */
export function activeAccountingTab(pathname: string) {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  let best: { key: (typeof items)[number]["key"]; length: number } | undefined;
  for (const item of items) {
    for (const href of [item.href, ...item.also]) {
      if (!matches(normalized, href)) continue;
      if (!best || href.length > best.length) best = { key: item.key, length: href.length };
    }
  }
  return best?.key;
}

export function AccountingNav() {
  const pathname = usePathname();
  const t = useTranslations("accountingShell");
  const activeKey = activeAccountingTab(pathname);
  const navRef = useRef<HTMLElement | null>(null);
  const activeRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    // Keep the current tab visible on narrow screens where the bar scrolls,
    // without touching the page's vertical scroll position.
    const nav = navRef.current;
    const tab = activeRef.current;
    if (!nav || !tab || nav.scrollWidth <= nav.clientWidth) return;
    const target = tab.offsetLeft - (nav.clientWidth - tab.offsetWidth) / 2;
    nav.scrollLeft = Math.max(0, target);
  }, [activeKey]);

  return (
    <nav ref={navRef} aria-label={t("navigationLabel")} className="scroll-fade-x relative -mx-4 px-4 sm:mx-0 sm:px-0">
      <div className="flex min-w-max gap-1 pr-6">
        {items.map((item) => {
          const active = item.key === activeKey;
          const Icon = icons[item.key];

          return (
            <Link
              key={item.href}
              href={item.href}
              ref={active ? activeRef : undefined}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex h-11 shrink-0 items-center gap-2 px-3 text-sm font-medium whitespace-nowrap text-[#61706b] dark:text-muted-foreground transition-colors hover:text-[#173c32] dark:hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315c73] dark:focus-visible:ring-ring focus-visible:ring-inset",
                active && "text-[#173c32] dark:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "size-4 text-[#87938f] dark:text-muted-foreground transition-colors group-hover:text-[#315c73] dark:group-hover:text-foreground",
                  active && "text-[#315c73] dark:text-foreground",
                )}
              />
              {t(item.key)}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute inset-x-3 bottom-0 h-0.5 origin-left scale-x-0 rounded-full bg-[#315c73] dark:bg-foreground transition-transform",
                  active && "scale-x-100",
                )}
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
