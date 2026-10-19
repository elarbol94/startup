"use client";

import { useTranslations } from "next-intl";
import { Archive, File, Folder, Inbox, MailWarning, MoreHorizontal, Pencil, Plus, RefreshCw, Send, Star, Trash2, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip";
import { MAIL_PAGE_SHORTCUTS } from "@/lib/app-shortcuts";
import { cn } from "@/lib/utils";
import type { MailAccountSummary, MailFolder, MailSpecialUse } from "../../types";
import type { Loadable } from "./use-mailbox";

const folderIcons: Partial<Record<MailSpecialUse, LucideIcon>> = {
  inbox: Inbox,
  sent: Send,
  drafts: File,
  trash: Trash2,
  junk: MailWarning,
  archive: Archive,
  flagged: Star,
};

/** Translated name for special folders; the server's name otherwise. */
export function useFolderLabel() {
  const t = useTranslations("mail.folders");
  return (folder: Pick<MailFolder, "name" | "specialUse"> | undefined) =>
    folder?.specialUse && folder.specialUse !== "all" && folder.specialUse !== "flagged" ? t(folder.specialUse) : folder?.name ?? "";
}

export function FolderPane({ accounts, accountId, folders, folderPath, onSelectAccount, onSelectFolder, onCompose, onAddAccount, onEditAccount, onRemoveAccount, onRefresh }: {
  accounts: MailAccountSummary[];
  accountId: string;
  folders: Loadable<MailFolder[]>;
  folderPath: string;
  onSelectAccount: (id: string) => void;
  onSelectFolder: (folder: MailFolder) => void;
  onCompose: () => void;
  onAddAccount: () => void;
  onEditAccount: () => void;
  onRemoveAccount: () => void;
  onRefresh: () => void;
}) {
  const t = useTranslations("mail");
  const tErrors = useTranslations("mail.errors");
  const label = useFolderLabel();
  const account = accounts.find((entry) => entry.id === accountId);

  return (
    <nav className="flex h-full min-h-0 flex-col" aria-label={t("folders.label")}>
      <div className="space-y-2 p-3">
        <ShortcutTooltip label={t("actions.compose")} shortcut={MAIL_PAGE_SHORTCUTS.compose}>
          <Button className="w-full" onClick={onCompose}><Pencil />{t("actions.compose")}</Button>
        </ShortcutTooltip>
        <div className="flex items-center gap-1">
          {accounts.length > 1 ? (
            <select
              aria-label={t("account.switch")}
              className="h-7 min-w-0 flex-1 truncate rounded-md border border-input bg-transparent px-1.5 text-xs dark:bg-input/30"
              value={accountId}
              onChange={(event) => onSelectAccount(event.target.value)}
            >
              {accounts.map((entry) => <option key={entry.id} value={entry.id}>{entry.emailAddress}</option>)}
            </select>
          ) : (
            <p className="min-w-0 flex-1 truncate px-1 text-xs text-muted-foreground" title={account?.emailAddress}>{account?.emailAddress}</p>
          )}
          <Button variant="ghost" size="icon-xs" onClick={onRefresh} aria-label={t("actions.refresh")} title={t("actions.refresh")}><RefreshCw /></Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label={t("account.menu")} title={t("account.menu")} />}>
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={onEditAccount}><Pencil />{t("account.edit")}</DropdownMenuItem>
              <DropdownMenuItem onClick={onAddAccount}><Plus />{t("account.add")}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onRemoveAccount}><Trash2 />{t("account.remove")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {folders.status === "error" ? (
          <p className="px-2 py-1 text-xs text-destructive">{tErrors(folders.error)}</p>
        ) : folders.status !== "ready" ? (
          <div className="space-y-2 px-2 py-1">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-5 w-full" />)}</div>
        ) : (
          <ul className="space-y-px">
            {folders.value.map((folder) => {
              const Icon = (folder.specialUse && folderIcons[folder.specialUse]) || Folder;
              const active = folder.path === folderPath;
              return (
                <li key={folder.path}>
                  <button
                    type="button"
                    disabled={!folder.selectable}
                    aria-current={active ? "page" : undefined}
                    onClick={() => onSelectFolder(folder)}
                    style={{ paddingLeft: `${8 + Math.min(folder.depth, 4) * 12}px` }}
                    className={cn(
                      "flex h-8 w-full items-center gap-2 rounded-md pr-2 text-left text-[13px] outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent max-md:h-10",
                      active && "bg-accent font-medium text-foreground",
                    )}
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{label(folder)}</span>
                    {folder.unseen > 0 && folder.specialUse !== "trash" && folder.specialUse !== "junk" ? (
                      <span className="text-[11.5px] font-semibold text-primary tabular-nums">{folder.unseen}</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </nav>
  );
}
