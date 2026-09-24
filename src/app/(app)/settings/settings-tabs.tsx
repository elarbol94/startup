"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type Tab = { href: string; label: string };

export function SettingsTabs({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations("settings.tabs");
  const tSettings = useTranslations("settings");
  const pathname = usePathname();

  const groups: { key: string; label: string; tabs: Tab[] }[] = [
    { key: "personal", label: t("personalGroup"), tabs: [{ href: "/settings/profile", label: t("profile") }] },
    ...(isAdmin
      ? [
          {
            key: "admin",
            label: t("adminGroup"),
            tabs: [
              { href: "/settings/company", label: t("company") },
              { href: "/settings/categories", label: t("categories") },
              { href: "/settings/locations", label: t("locations") },
              { href: "/settings/users", label: t("users") },
              { href: "/settings/version-control", label: t("versionControl") },
            ],
          },
        ]
      : []),
  ];
  // A single group needs no group label.
  const showGroupLabels = groups.length > 1;

  return (
    <nav className="scroll-fade-x flex items-end border-b" aria-label={tSettings("title")}>
      {groups.map((group, index) => (
        <div
          key={group.key}
          role="group"
          aria-label={group.label}
          className={cn("flex shrink-0 items-end", index > 0 && "ml-3 border-l pl-3")}
        >
          {showGroupLabels ? (
            <span aria-hidden className="mr-1 self-center pb-0.5 text-[10px] font-semibold tracking-[0.12em] whitespace-nowrap text-muted-foreground/80 uppercase">
              {group.label}
            </span>
          ) : null}
          {group.tabs.map((tab) => {
            const active = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors sm:px-4",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
