"use client";

import { railBootstrapScript } from "./sidebar-model";

/**
 * Applies the stored collapsed sidebar state to <html> while the HTML is parsed, so a reload
 * with a collapsed sidebar never paints the wide one first. On client navigations the script
 * is inert (text/plain) and useSidebarRail keeps the attribute in sync instead.
 */
export function RailBootstrapScript({ userId }: { userId: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: railBootstrapScript(userId) }}
    />
  );
}
