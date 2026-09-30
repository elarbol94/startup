"use client";

import { useSyncExternalStore } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import { Link2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { parseSourcePassage, SOURCE_PASSAGE_EVENT, SOURCE_PASSAGE_KEY } from "../lib/source-passage";

function subscribe(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(SOURCE_PASSAGE_EVENT, notify);
  return () => { window.removeEventListener("storage", notify); window.removeEventListener(SOURCE_PASSAGE_EVENT, notify); };
}
function snapshot() {
  try { return localStorage.getItem(SOURCE_PASSAGE_KEY); } catch { return null; }
}

export function SourcePassageButton({ editor }: { editor: Editor | null }) {
  const t = useTranslations("wiki");
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  const passage = parseSourcePassage(raw);
  const canLink = useEditorState({ editor, selector: ({ editor }) => Boolean(editor?.isEditable && !editor.state.selection.empty && editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to).trim()) });
  if (!passage) return null;
  return <Button type="button" size="icon-sm" variant="ghost" data-testid="link-source-passage" disabled={!canLink}
    aria-label={t("linkSourcePassage")} title={canLink ? `${t("linkSourcePassage")} · ${passage.title}: ${passage.quote}` : t("selectTextToLinkPassage")}
    onMouseDown={(event) => event.preventDefault()}
    onClick={() => { if (canLink) editor?.chain().focus().setLink({ href: passage.href }).run(); }}>
    <Link2 className="size-4" />
  </Button>;
}
