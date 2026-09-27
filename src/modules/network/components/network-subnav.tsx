"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ListTodo, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/network", key: "contactsTab", icon: UsersRound },
  { href: "/network/opportunities", key: "opportunitiesTab", icon: ListTodo },
] as const;

export function NetworkSubnav() {
  const t = useTranslations("network");
  const pathname = usePathname();
  const active = pathname.startsWith("/network/opportunities") ? "/network/opportunities" : "/network";
  return (
    <nav className="flex items-center gap-1 rounded-xl border bg-muted/35 p-1" aria-label={t("subnavLabel")}>
      {tabs.map(({ href, key, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={active === href ? "page" : undefined}
          className={cn(
            "inline-flex h-8 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors",
            active === href ? "bg-background shadow-sm" : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
          )}
        >
          <Icon className="size-4" />
          {t(key)}
        </Link>
      ))}
    </nav>
  );
}
