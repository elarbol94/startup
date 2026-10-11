"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { FileDown, MoreHorizontal, Pencil, Play, Presentation, Trash2 } from "lucide-react";
import { UserIdentity } from "@/components/user-identity";
import { RowSelectCheckbox } from "@/components/row-selection";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { RowSelection } from "@/lib/use-row-selection";
import type { PresentationListItem } from "../../presentation-queries";
import { PresentationScene } from "../presentation-scene";

export function PresentationCard({ item, selection, onRename, onDelete }: {
  item: PresentationListItem;
  selection: RowSelection;
  onRename: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("wiki");
  const format = useFormatter();
  const owner = item.role === "owner";
  const canEdit = owner || item.role === "edit";
  const selected = selection.isSelected(item.id);
  return (
    <li data-selected={selected || undefined} data-testid="presentation-card" className="group relative min-w-0 overflow-hidden rounded-xl border bg-card shadow-card transition-shadow hover:shadow-md data-selected:ring-2 data-selected:ring-brand">
      {/* Only owners can delete, and deleting is the only bulk action here. */}
      {owner && (
        <span className={cn("absolute top-2 left-2 z-10 grid size-7 place-items-center rounded-md bg-card/90 shadow-sm transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100", selection.count > 0 && "sm:opacity-100")}>
          <RowSelectCheckbox id={item.id} label={item.title} selection={selection} />
        </span>
      )}
      <Link href={`/wiki/presentations/${item.id}`} aria-label={item.title} className="block rounded-t-xl outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring">
        <div className="aspect-video overflow-hidden border-b border-line-soft bg-surface-raised p-3" aria-hidden="true" inert style={{ contentVisibility: "auto", containIntrinsicSize: "400px 225px" }}>
          {item.elementCount ? <div className="pointer-events-none h-full w-full overflow-hidden rounded-sm bg-white shadow-sm"><PresentationScene presentation={item.preview} index={0} interactive={false} /></div> : <div className="grid h-full place-items-center"><Presentation className="size-10 text-text-tertiary/40" /></div>}
        </div>
        <h2 className="line-clamp-2 px-[18px] pt-3.5 text-[14.5px] font-semibold">{item.title}</h2>
      </Link>
      <div className="flex items-center gap-2 pt-1.5 pr-3 pb-3 pl-[18px]">
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={item.updatedByName ?? undefined}>{format.dateTime(item.updatedAt, { dateStyle: "medium", timeZone: "Europe/Vienna" })}{item.updatedByName && <> · <UserIdentity userId={item.updatedBy} name={item.updatedByName} compact /></>}</p>
        {item.stepCount > 0 && <Link href={`/wiki/presentations/${item.id}/present`} className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12.5px] font-medium text-brand-ink transition-colors outline-none hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-ring"><Play className="size-3.5" />{t("presentations.present")}</Link>}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={t("workspace.itemActions", { title: item.title })} />}><MoreHorizontal className="size-4" /></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem render={<Link href={`/wiki/presentations/${item.id}`} />}>{t("edit")}</DropdownMenuItem>
            {canEdit && <DropdownMenuItem onClick={onRename}><Pencil />{t("presentations.rename")}</DropdownMenuItem>}
            {item.stepCount > 0 && <DropdownMenuItem render={<a href={`/print/presentations/${item.id}`} target="_blank" rel="noopener noreferrer" />}><FileDown />{t("presentations.exportPdf")}</DropdownMenuItem>}
            {owner && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onClick={onDelete}><Trash2 />{t("presentations.deletePresentation")}</DropdownMenuItem></>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}
