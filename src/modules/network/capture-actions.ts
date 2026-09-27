"use server";

import { requireUserOrThrow } from "@/lib/auth";
import { listNetworkContactOptions, listNetworkMetContextSuggestions, listNetworkTagSuggestions } from "./queries";

/** Names, tags and places for the quick-capture dialog, loaded when it opens from anywhere in the app. */
export async function getQuickCaptureOptions() {
  const viewer = await requireUserOrThrow();
  return {
    contacts: listNetworkContactOptions(viewer),
    tags: listNetworkTagSuggestions(viewer),
    metContexts: listNetworkMetContextSuggestions(viewer),
  };
}
