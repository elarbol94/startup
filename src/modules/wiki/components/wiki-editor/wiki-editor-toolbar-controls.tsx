"use client";
// Small toolbar primitives of the wiki editor: icon button with tooltip, dropdown menu and
// labelled button group. Used by wiki-editor.tsx.
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function ToolbarButton({ active, disabled, onClick, title, shortcut, children }: { active?: boolean; disabled?: boolean; onClick: () => void; title: string; shortcut?: string; children: React.ReactNode }) {
  return <Tooltip>
    <TooltipTrigger render={<Button type="button" variant={active ? "secondary" : "ghost"} size="icon-sm" aria-label={title} aria-pressed={active} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={onClick} />}>{children}</TooltipTrigger>
    <TooltipContent>{title}{shortcut && <kbd className="ml-1 rounded bg-background/15 px-1 py-0.5 font-mono">{shortcut}</kbd>}</TooltipContent>
  </Tooltip>;
}

export function ToolbarMenu({ label, icon, children, onPointerDown }: { label: string; icon: React.ReactNode; children: React.ReactNode; onPointerDown?: () => void }) {
  return <DropdownMenu>
    <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="sm" className="gap-1 px-2" aria-label={label} onFocus={onPointerDown} onPointerDown={onPointerDown} />}>{icon}<span className="text-xs">{label}</span></DropdownMenuTrigger>
    <DropdownMenuContent className="w-56">{children}</DropdownMenuContent>
  </DropdownMenu>;
}

export function ToolbarGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return <div role="group" aria-label={label} className="flex items-center gap-0.5 border-r border-border/60 pr-2 last:border-0">
    {children}
  </div>;
}
