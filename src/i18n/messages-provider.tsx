import type { ReactNode } from "react";
import { getLocale } from "next-intl/server";
import { DeMessagesProvider } from "./messages-provider-de";
import { EnMessagesProvider } from "./messages-provider-en";

// The client providers import their catalogue, so it ships as a cached JS chunk
// instead of ~300 kB inlined into every page's HTML (each workspace pane is a page load).
export async function MessagesProvider({ children }: { children: ReactNode }) {
  const Provider = (await getLocale()) === "en" ? EnMessagesProvider : DeMessagesProvider;
  return <Provider>{children}</Provider>;
}
