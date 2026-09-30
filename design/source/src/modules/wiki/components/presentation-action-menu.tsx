"use client";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuShortcut } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { EditorSearchCommand } from "./editor-command-search";
export function PresentationActionMenu({ commands, label, position, onClose, shortcutLabels, showCommand }: { commands: EditorSearchCommand[]; showCommand: (id: string) => boolean; shortcutLabels: Record<string, string>; label: string; position?: { x: number; y: number }; onClose?: () => void }) {
  return <DropdownMenu {...(position ? { open: true, onOpenChange: (open: boolean) => { if (!open) onClose?.(); } } : {})}>
    <DropdownMenuTrigger render={position ? <button aria-label={label} style={{ position: "fixed", left: position.x, top: position.y, width: 1, height: 1, opacity: 0 }} /> : <Button size="sm" variant="ghost" />} >{!position && label}</DropdownMenuTrigger>
    <DropdownMenuContent className="min-w-64" finalFocus={position ? false : undefined}>
      {commands.filter(command => showCommand(command.id)).map(command => <DropdownMenuItem key={command.id} disabled={Boolean(command.disabledReason)} title={command.disabledReason} onClick={() => { if (!command.disabledReason) { command.execute(); onClose?.(); } }}>
        {command.label}{shortcutLabels[command.id] && <DropdownMenuShortcut>{shortcutLabels[command.id]}</DropdownMenuShortcut>}
      </DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>;
}

export function PresentationShortcutHelp({ open, onOpenChange, title, help, commands, shortcutLabels }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; help: string; commands: EditorSearchCommand[]; shortcutLabels: Record<string, string> }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader><div className="max-h-[65vh] overflow-auto space-y-2">{commands.filter(c => shortcutLabels[c.id]).map(c => <div key={c.id} className="flex justify-between gap-4 text-sm"><span>{c.label}</span><kbd>{shortcutLabels[c.id]}</kbd></div>)}<p className="text-sm">{help}</p></div></DialogContent></Dialog>;
}
