"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Menu, PanelLeftClose, Search, Share2, X } from "lucide-react";
import { UserMenu } from "@/components/user-menu";
import { ShareMenu } from "@/components/share/share-menu";
import { currentPageShareTarget } from "@/components/share/share-target";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useKeyboardShortcuts } from "@/components/use-keyboard-shortcut";
import { NAVIGATION_SHORTCUTS } from "@/lib/app-shortcuts";
import { cn } from "@/lib/utils";
import { requestAppNavigation } from "@/lib/app-navigation";
import { isNavItemActive, moduleNav, moduleNavItemForPath } from "@/modules/registry";
import { WorkspaceSearch } from "@/modules/context/components/workspace-search";
import { AppNavigation } from "./app-sidebar/app-navigation";
import { brandInitials, type SidebarGroupLayout } from "./app-sidebar/sidebar-model";
import { useSidebarRail } from "./app-sidebar/use-sidebar-rail";

const subscribeNever = () => () => {};

function BrandMark({ name }: { name: string }) {
  return (
    <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-md bg-brand-soft text-xs font-bold text-brand-ink">
      {brandInitials(name)}
    </span>
  );
}

export function AppSidebar({
  userId,
  userName,
  userEmail,
  companyName,
  groupLayout,
}: {
  userId: string;
  userName: string;
  userEmail: string;
  companyName?: string;
  groupLayout: SidebarGroupLayout;
}) {
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const tShare = useTranslations("share");
  const productName = companyName?.trim() || tCommon("appName");
  const pathname = usePathname();
  const { collapsed, setCollapsed } = useSidebarRail(userId);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const router = useRouter();
  useKeyboardShortcuts(
    [...moduleNav, { key: "settings" as const, href: "/settings" }].map((item) => ({
      shortcut: NAVIGATION_SHORTCUTS[item.key],
      handler: () => requestAppNavigation(item.href, () => router.push(item.href)),
    })),
  );
  // The sidebar streams in late; by the time it hydrates the person may already have
  // navigated, so the path-dependent title only appears once hydration is done.
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);
  const currentSection = hydrated ? moduleNavItemForPath(pathname) : undefined;
  const mobileTitle = currentSection
    ? t(currentSection.key)
    : hydrated && isNavItemActive("/settings", pathname) ? t("settings") : productName;

  return (
    <>
      <header data-testid="app-mobile-header" className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b bg-sidebar/95 px-3 backdrop-blur md:hidden">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("openNavigation")}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="size-5" />
        </Button>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">{mobileTitle}</span>
        <ShareMenu target={currentPageShareTarget} label={tShare("sharePage")} variant="ghost" size="icon">
          <Share2 className="size-5" />
        </ShareMenu>
        <Button type="button" variant="ghost" size="icon" aria-label={tCommon("search")} onClick={() => setSearchOpen(true)}>
          <Search className="size-5" />
        </Button>
        <UserMenu name={userName} email={userEmail} compact />
      </header>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          data-testid="app-navigation-sheet"
          data-workspace-navigation
          side="left"
          showCloseButton={false}
          className="w-[min(20rem,88vw)] gap-0 bg-sidebar p-0 md:hidden"
        >
          <SheetHeader className="h-14 flex-row items-center gap-2.5 border-b border-sidebar-border px-4 py-0 pr-2">
            <BrandMark name={productName} />
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-sm">{productName}</SheetTitle>
              <SheetDescription className="sr-only">{t("navigationDescription")}</SheetDescription>
            </div>
            <SheetClose render={<Button type="button" variant="ghost" size="icon-sm" aria-label={t("closeNavigation")} />}>
              <X className="size-4" />
            </SheetClose>
          </SheetHeader>
          <AppNavigation
            compact={false}
            navigationId="app-mobile-navigation"
            pathname={pathname}
            userName={userName}
            userEmail={userEmail}
            onNavigate={() => setMobileOpen(false)}
            onOpenSearch={() => setSearchOpen(true)}
            showShare={false}
            groupLayout={groupLayout}
          />
        </SheetContent>
      </Sheet>

      <aside
        data-testid="app-sidebar"
        data-side-panel={collapsed ? "collapsed" : "expanded"}
        data-collapsed={collapsed}
        className="app-rail-transition fixed inset-y-0 left-0 z-40 hidden h-dvh w-[var(--app-rail-width)] shrink-0 flex-col border-r border-sidebar-border bg-sidebar duration-[220ms] ease-out motion-reduce:transition-none md:flex"
      >
        <div className={cn("flex h-14 shrink-0 items-center gap-2.5 overflow-hidden border-b border-sidebar-border", collapsed ? "justify-center px-2" : "pr-2 pl-4")}>
          <Link href="/" title={productName} aria-label={collapsed ? productName : undefined} className="flex min-w-0 flex-1 items-center justify-center gap-2.5 rounded-md outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <BrandMark name={productName} />
            {!collapsed && <span className="min-w-0 flex-1 truncate text-sm font-semibold">{productName}</span>}
          </Link>
          {!collapsed && (
            <Button type="button" variant="ghost" size="icon-sm" className="text-text-secondary" aria-label={t("collapseNavigation")} title={t("collapseNavigation")} onClick={() => setCollapsed(true)}>
              <PanelLeftClose />
            </Button>
          )}
        </div>
        <AppNavigation
          compact={collapsed}
          navigationId="app-primary-navigation"
          pathname={pathname}
          userName={userName}
          userEmail={userEmail}
          onOpenSearch={() => setSearchOpen(true)}
          onExpand={() => setCollapsed(false)}
          groupLayout={groupLayout}
        />
      </aside>
      <WorkspaceSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
