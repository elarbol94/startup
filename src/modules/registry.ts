import {
  BookOpen,
  Calculator,
  CalendarDays,
  KanbanSquare,
  LayoutDashboard,
  MapPinned,
  UserRoundCog,
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
  key: "dashboard" | "calendar" | "accounting" | "personnel" | "projects" | "wiki" | "municipalities";
  href: string;
  icon: LucideIcon;
};

export const moduleNav: ModuleNavItem[] = [
  { key: "dashboard", href: "/", icon: LayoutDashboard },
  { key: "calendar", href: "/calendar", icon: CalendarDays },
  { key: "accounting", href: "/accounting", icon: Calculator },
  { key: "personnel", href: "/personnel", icon: UserRoundCog },
  { key: "projects", href: "/projects", icon: KanbanSquare },
  { key: "wiki", href: "/wiki", icon: BookOpen },
  { key: "municipalities", href: "/municipalities/overview", icon: MapPinned },
];

/** Routes outside a section's own path that should highlight that section. */
export const navSectionAliases: Record<string, string> = {
  "/documents": "/accounting",
};
