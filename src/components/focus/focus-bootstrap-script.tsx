"use client";

import { focusBootstrapScript } from "@/lib/focus-mode";

/**
 * Applies the stored focus preferences to <html> while the HTML is parsed, so a reload in
 * focus mode never paints the sidebar first. On client navigations the script is inert
 * (text/plain) and FocusModeProvider keeps the attributes in sync instead.
 */
export function FocusBootstrapScript({ userId }: { userId: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: focusBootstrapScript(userId) }}
    />
  );
}
