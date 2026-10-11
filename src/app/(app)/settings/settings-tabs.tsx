"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { SubNav, SubNavGroup, SubNavLink } from "@/components/ui/sub-nav";

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
              { href: "/settings/documents", label: t("documents") },
            ],
          },
        ]
      : []),
  ];
  // A single group needs no group label.
  const showGroupLabels = groups.length > 1;

  return (
    <SubNav label={tSettings("title")}>
      {groups.map((group, index) => (
        <SubNavGroup key={group.key} label={group.label} showLabel={showGroupLabels} divided={index > 0}>
          {group.tabs.map((tab) => (
            <SubNavLink key={tab.href} href={tab.href} active={pathname.startsWith(tab.href)}>
              {tab.label}
            </SubNavLink>
          ))}
        </SubNavGroup>
      ))}
    </SubNav>
  );
}
