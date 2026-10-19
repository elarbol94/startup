import {
  BookOpen,
  Calculator,
  CalendarDays,
  Cloud,
  Handshake,
  KanbanSquare,
  LayoutDashboard,
  Mail,
  MapPinned,
  MessagesSquare,
  Timer,
  UserRoundCog,
  Video,
  type LucideIcon,
} from "lucide-react";

// Adding a module: create src/modules/<name>/ with schema/queries/actions,
// add a route group under src/app/(app)/<name>/ and register it here.
//
// `/documents` is intentionally not listed: it renders the same
// DocumentsWorkspace as the Buchhaltung tab `/accounting/invoices`, so a
// second top-level entry only duplicated navigation. The route keeps working
// for bookmarks and highlights "Buchhaltung" in the sidebar (see
// `navSectionAliases`).
export type ModuleNavItem = {
  /** Translation key under the `nav` namespace */
  key: "dashboard" | "calendar" | "accounting" | "personnel" | "time" | "projects" | "wiki" | "municipalities" | "network" | "meetings" | "chat" | "mail" | "cloud";
  href: string;
  icon: LucideIcon;
  /** Sidebar group; translation key under `nav.groups` */
  group: ModuleNavGroup;
};

export type ModuleNavGroup = "work" | "finance" | "knowledge";

/** Sidebar group order. Settings is not part of a group; it sits in the sidebar footer. */
export const moduleNavGroups: ModuleNavGroup[] = ["work", "finance", "knowledge"];

export const moduleNav: ModuleNavItem[] = [
  { key: "dashboard", href: "/", icon: LayoutDashboard, group: "work" },
  { key: "calendar", href: "/calendar", icon: CalendarDays, group: "work" },
  { key: "projects", href: "/projects", icon: KanbanSquare, group: "work" },
  { key: "time", href: "/time", icon: Timer, group: "work" },
  { key: "meetings", href: "/meetings", icon: Video, group: "work" },
  { key: "chat", href: "/chat", icon: MessagesSquare, group: "work" },
  { key: "mail", href: "/mail", icon: Mail, group: "work" },
  { key: "cloud", href: "/cloud", icon: Cloud, group: "work" },
  { key: "accounting", href: "/accounting", icon: Calculator, group: "finance" },
  { key: "personnel", href: "/personnel", icon: UserRoundCog, group: "finance" },
  { key: "wiki", href: "/wiki", icon: BookOpen, group: "knowledge" },
  { key: "municipalities", href: "/municipalities/overview", icon: MapPinned, group: "knowledge" },
  { key: "network", href: "/network", icon: Handshake, group: "knowledge" },
];

/** Routes outside a section's own path that should highlight that section. */
export const navSectionAliases: Record<string, string> = {
  "/documents": "/accounting",
};

/** Whether a navigation entry belongs to the current page (`navSectionAliases` included). */
export function isNavItemActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  const section = `/${href.split("/")[1]}`;
  const currentSection = `/${pathname.split("/")[1]}`;
  return (navSectionAliases[currentSection] ?? currentSection) === section;
}

/** The module a path belongs to, if any (settings is not a module). */
export function moduleNavItemForPath(pathname: string): ModuleNavItem | undefined {
  return moduleNav.find((item) => isNavItemActive(item.href, pathname));
}
