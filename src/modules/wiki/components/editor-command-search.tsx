"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { searchEditorCommands, type SearchableEditorCommand } from "../lib/command-search";

export type EditorSearchCommand = SearchableEditorCommand & {
  group: string;
  active?: boolean;
  shortcut?: string;
  disabledReason?: string;
  execute: () => void;
};

export function EditorCommandSearch({ commands, onClose, onExecute, title, description }: {
  title?: string;
  description?: string;
  commands: EditorSearchCommand[];
  onClose: () => void;
  onExecute: (command: EditorSearchCommand) => void;
}) {
  const t = useTranslations("wiki.commandSearch");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const results = searchEditorCommands(commands, query);
  const index = Math.min(selected, Math.max(0, results.length - 1));
  const active = results[index];
  useEffect(() => { document.getElementById(`${listId}-${index}`)?.scrollIntoView({ block: "nearest" }); }, [index, listId, query]);
  const execute = (command: EditorSearchCommand) => { if (!command.disabledReason) onExecute(command); };
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent data-editor-command-search initialFocus={input} finalFocus={false} className="gap-3 p-0 sm:max-w-xl" showCloseButton={false}>
      <DialogHeader className="px-5 pt-5">
        <DialogTitle>{title ?? t("title")}</DialogTitle>
        <DialogDescription>{description ?? t("description")}</DialogDescription>
      </DialogHeader>
      <div className="relative mx-4">
        <Search className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground" />
        <Input ref={input} role="combobox" aria-label={title ?? t("title")} aria-autocomplete="list" aria-expanded="true" aria-controls={listId} aria-activedescendant={active ? `${listId}-${index}` : undefined}
          placeholder={t("placeholder")} className="h-10 pl-9" value={query}
          onChange={(event) => { setQuery(event.target.value); setSelected(0); }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setSelected(results.length ? (index + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length : 0);
            } else if (event.key === "Enter" && active) { event.preventDefault(); execute(active); }
            else if (event.key === "Tab" && !event.shiftKey && active && query !== active.label) { event.preventDefault(); setQuery(active.label); setSelected(0); }
          }} />
      </div>
      <div id={listId} role="listbox" aria-label={title ?? t("title")} className="max-h-[min(55vh,24rem)] overflow-y-auto px-2 pb-2">
        {results.length === 0 && <p role="status" className="px-3 py-8 text-center text-sm text-muted-foreground">{t("empty")}</p>}
        {results.map((command, row) => <div key={command.id} id={`${listId}-${row}`} role="option" aria-selected={row === index} aria-disabled={Boolean(command.disabledReason)}
          onMouseMove={() => setSelected(row)} onMouseDown={(event) => event.preventDefault()} onClick={() => execute(command)}
          className={`flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2.5 ${row === index ? "bg-accent text-accent-foreground" : ""} ${command.disabledReason ? "opacity-50" : ""}`}>
          <div className="min-w-0"><div className="flex items-center gap-2 text-sm font-medium">{command.label}{command.active !== undefined && <span className="rounded border px-1.5 text-xs font-normal">{t(command.active ? "on" : "off")}</span>}</div><div className="text-xs text-muted-foreground">{command.disabledReason || (command.contextPriority ? t("context") : command.recentIndex !== undefined ? t("recent") : command.group)}</div></div>
          {command.shortcut && <kbd className="shrink-0 rounded border px-1.5 py-0.5 text-xs text-muted-foreground">{command.shortcut}</kbd>}
        </div>)}
      </div>
      <div className="border-t px-5 py-3 text-xs text-muted-foreground">{t("keys")}</div>
    </DialogContent>
  </Dialog>;
}
