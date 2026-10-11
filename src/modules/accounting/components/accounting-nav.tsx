"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  BookOpenText,
  CalendarRange,
  FileText,
  HandCoins,
  LayoutDashboard,
} from "lucide-react";
import { SubNav, SubNavLink } from "@/components/ui/sub-nav";

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

  return (
    <SubNav label={t("navigationLabel")}>
      {items.map((item) => {
        const Icon = icons[item.key];
        return (
          <SubNavLink key={item.href} href={item.href} active={item.key === activeKey} icon={<Icon />}>
            {t(item.key)}
          </SubNavLink>
        );
      })}
    </SubNav>
  );
}

/** "Finanzbereich" eyebrow for accounting page headers. */
export function AccountingEyebrow() {
  return useTranslations("accountingShell")("eyebrow");
}
