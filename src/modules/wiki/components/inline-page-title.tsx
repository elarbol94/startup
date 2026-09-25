"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

const TITLE_CLASS = "max-w-4xl break-words text-left text-xl font-semibold tracking-tight";

/**
 * The page heading doubles as its rename control: click (or Enter/Space) turns it
 * into a text field that saves on Enter or blur and restores the old title on Escape.
 */
export function InlinePageTitle({ title, onRename }: { title: string; onRename: (title: string) => Promise<void> }) {
  const t = useTranslations("wiki");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  // Shown from submit until the server title arrives, so the heading doesn't flash back.
  const [pending, setPending] = useState<string | null>(null);
  const [seenTitle, setSeenTitle] = useState(title);
  if (title !== seenTitle) { setSeenTitle(title); setPending(null); }
  const settled = useRef(false);
  const refocus = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const displayed = pending ?? title;

  useEffect(() => {
    if (!editing && refocus.current) { refocus.current = false; buttonRef.current?.focus(); }
  }, [editing]);

  function start() {
    settled.current = false;
    setDraft(displayed);
    setEditing(true);
  }

  async function commit() {
    if (settled.current) return;
    settled.current = true;
    setEditing(false);
    const next = draft.trim();
    if (!next || next === displayed) return;
    setPending(next);
    try {
      await onRename(next);
    } catch {
      setPending(null);
      toast.error(t("renameFailed"));
    }
  }

  function cancel() {
    settled.current = true;
    setEditing(false);
    setDraft(displayed);
  }

  if (editing) {
    return <input
      autoFocus
      data-testid="page-title-input"
      aria-label={t("pageTitle")}
      value={draft}
      maxLength={200}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Enter") { event.preventDefault(); refocus.current = true; void commit(); }
        else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); refocus.current = true; cancel(); }
      }}
      className={`${TITLE_CLASS} -mx-1 w-full min-w-[16rem] rounded-md bg-transparent px-1 outline-none ring-2 ring-indigo-500/60`}
    />;
  }

  return <button ref={buttonRef} type="button" aria-label={`${t("rename")}: ${displayed}`} title={t("rename")} onClick={start} aria-busy={pending !== null || undefined} className={`${TITLE_CLASS} hover:text-indigo-700 dark:hover:text-indigo-300`}>{displayed}</button>;
}
