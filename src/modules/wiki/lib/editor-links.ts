import type { EditorView } from "@tiptap/pm/view";
import { isAllowedUri } from "@tiptap/extension-link";

/** Open modified link clicks without changing the editor document. */
export function handleEditorLinkClick(view: EditorView, event: MouseEvent): boolean {
  if (event.button !== 0 || !(event.ctrlKey || event.metaKey)) return false;
  const target = event.target;
  const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  const anchor = element?.closest("a[href]");
  if (!anchor || !view.dom.contains(anchor)) return false;
  const href = anchor.getAttribute("href");
  if (!href || !isAllowedUri(href, [])) return false;
  event.preventDefault();
  event.stopPropagation();
  window.open(href, "_blank", "noopener,noreferrer");
  return true;
}
