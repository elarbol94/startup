"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Building2, ListTodo, Map as MapIcon, UsersRound } from "lucide-react";
import { SubNav, SubNavLink } from "@/components/ui/sub-nav";

const tabs = [
  { href: "/network", key: "contactsTab", icon: UsersRound },
  { href: "/network/opportunities", key: "opportunitiesTab", icon: ListTodo },
  { href: "/network/organizations", key: "organizationsTab", icon: Building2 },
  { href: "/network/map", key: "mapTab", icon: MapIcon },
] as const;

export function NetworkSubnav() {
  const t = useTranslations("network");
  const pathname = usePathname();
  const active = tabs.find((tab) => tab.href !== "/network" && pathname.startsWith(tab.href))?.href ?? "/network";
  return (
    <SubNav label={t("subnavLabel")}>
      {tabs.map(({ href, key, icon: Icon }) => (
        <SubNavLink key={href} href={href} active={active === href} icon={<Icon />}>
          {t(key)}
        </SubNavLink>
      ))}
    </SubNav>
  );
}
