"use client";

// Share actions for one page or item: the system share sheet (phones, Windows, macOS Safari),
// copying the link plain or with its title, and copying it for the Chat section.
import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { requestAppNavigation } from "@/lib/app-navigation";
import { absoluteShareUrl, htmlLink, markdownLink, shareTitle, type ShareTarget } from "@/lib/share-links";
import { writeClipboard } from "./clipboard";

const subscribeNever = () => () => {};

function supportsNativeShare() {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

/** Touch-first devices expect the share button to open the system sheet straight away. */
function prefersNativeShare() {
  return supportsNativeShare() && window.matchMedia("(pointer: coarse)").matches;
}

export function useShareLink() {
  const t = useTranslations("share");
  const router = useRouter();
  const canNativeShare = useSyncExternalStore(subscribeNever, supportsNativeShare, () => false);
  const nativeFirst = useSyncExternalStore(subscribeNever, prefersNativeShare, () => false);

  /** Null (with an error toast) when the link does not point at this site. */
  function resolve(target: ShareTarget) {
    try {
      return { title: shareTitle(target.title, t("fallbackTitle")), url: absoluteShareUrl(target.href, window.location.origin) };
    } catch {
      toast.error(t("copyFailed"));
      return null;
    }
  }

  async function copyLink(target: ShareTarget) {
    const link = resolve(target);
    if (!link) return;
    if (await writeClipboard(link.url)) toast.success(t("linkCopied"));
    else toast.error(t("copyFailed"));
  }

  async function copyTitledLink(target: ShareTarget) {
    const link = resolve(target);
    if (!link) return;
    const { title, url } = link;
    if (await writeClipboard(markdownLink(title, url), htmlLink(title, url))) toast.success(t("linkCopied"));
    else toast.error(t("copyFailed"));
  }

  async function shareNatively(target: ShareTarget) {
    if (!supportsNativeShare()) return copyLink(target);
    const link = resolve(target);
    if (!link) return;
    const { title, url } = link;
    try {
      await navigator.share({ title, text: title, url });
    } catch (error) {
      // Closing the sheet is not an error; anything else falls back to copying.
      if (error instanceof DOMException && error.name === "AbortError") return;
      await copyLink(target);
    }
  }

  /** Copies the titled link and opens the Chat section, ready to paste into a room. */
  async function shareInChat(target: ShareTarget) {
    const link = resolve(target);
    if (!link) return;
    const { title, url } = link;
    if (!(await writeClipboard(markdownLink(title, url), htmlLink(title, url)))) {
      toast.error(t("copyFailed"));
      return;
    }
    toast.success(t("linkCopiedForChat"));
    requestAppNavigation("/chat", () => router.push("/chat"));
  }

  return { canNativeShare, nativeFirst, copyLink, copyTitledLink, shareNatively, shareInChat };
}
