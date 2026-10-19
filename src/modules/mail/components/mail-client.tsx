"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FolderOpen, Mail, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { useKeyboardShortcuts } from "@/components/use-keyboard-shortcut";
import { MAIL_PAGE_SHORTCUTS } from "@/lib/app-shortcuts";
import { cn } from "@/lib/utils";
import { deleteMailAccount } from "../account-actions";
import type { ReplyKind } from "../mail-utils";
import { deleteMail, updateMailFlags } from "../message-actions";
import type { MailAccountSummary, MailFolder, MailListItem, MailMessage } from "../types";
import { AccountDialog } from "./mail-client/account-dialog";
import { ComposeDialog } from "./mail-client/compose-dialog";
import { newDraft, replyDraft, type ComposeDraft } from "./mail-client/compose-draft";
import { FolderPane, useFolderLabel } from "./mail-client/folder-pane";
import { formatFullDate } from "./mail-client/format";
import { MessageList } from "./mail-client/message-list";
import { MessageView } from "./mail-client/message-view";
import { useMailFolders, useMailMessage, useMailMessages } from "./mail-client/use-mailbox";

type MobileView = "folders" | "list" | "message";

/**
 * The Mail section: folders, message list and reader side by side (one at a
 * time on phones). Everything is read live from the user's IMAP mailbox.
 */
export function MailClient({ initialAccounts, userName }: { initialAccounts: MailAccountSummary[]; userName: string }) {
  const t = useTranslations("mail");
  const locale = useLocale();
  const folderLabel = useFolderLabel();
  const [confirmElement, confirm] = useConfirm();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [accountId, setAccountId] = useState<string | null>(initialAccounts[0]?.id ?? null);
  const [folderPath, setFolderPath] = useState("INBOX");
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [openUid, setOpenUid] = useState<number | null>(null);
  const [mobileView, setMobileView] = useState<MobileView>("list");
  const [draft, setDraft] = useState<ComposeDraft | null>(null);
  const [accountDialog, setAccountDialog] = useState<{ account: MailAccountSummary | null } | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  const account = accounts.find((entry) => entry.id === accountId) ?? null;
  const { folders, refreshFolders } = useMailFolders(account?.id ?? null);
  const { messages, refreshMessages, patchMessages } = useMailMessages(account ? { accountId: account.id, folder: folderPath, page, query, unreadOnly } : null);
  const { message, patchMessage } = useMailMessage(account && openUid !== null ? { accountId: account.id, folder: folderPath, uid: openUid } : null);

  const folderList = folders.status === "ready" ? folders.value : [];
  const currentFolder = folderList.find((folder) => folder.path === folderPath);
  // Some servers name the inbox differently in LIST; fall back to whatever they call it.
  if (folders.status === "ready" && !currentFolder && folderList.length > 0) {
    const inbox = folderList.find((folder) => folder.specialUse === "inbox") ?? folderList.find((folder) => folder.selectable);
    if (inbox && inbox.path !== folderPath) setFolderPath(inbox.path);
  }
  const items = messages.status === "ready" ? messages.value.items : [];
  const openMessage = message.status === "ready" ? message.value : null;

  function selectFolder(folder: MailFolder) {
    setFolderPath(folder.path);
    setPage(0);
    setQuery("");
    setOpenUid(null);
    setMobileView("list");
  }

  function selectAccount(id: string) {
    setAccountId(id);
    setFolderPath("INBOX");
    setPage(0);
    setQuery("");
    setOpenUid(null);
  }

  function open(item: MailListItem) {
    setOpenUid(item.uid);
    setMobileView("message");
    if (!item.seen) {
      patchMessages((current) => ({ ...current, items: current.items.map((entry) => (entry.uid === item.uid ? { ...entry, seen: true } : entry)) }));
      window.setTimeout(() => void refreshFolders(true), 1500);
    }
  }

  function step(offset: 1 | -1) {
    if (items.length === 0) return;
    const index = items.findIndex((item) => item.uid === openUid);
    const next = items[index === -1 ? 0 : Math.min(items.length - 1, Math.max(0, index + offset))];
    if (!next) return;
    open(next);
    document.querySelector(`[data-mail-uid="${next.uid}"]`)?.scrollIntoView({ block: "nearest" });
  }

  async function changeFlags(target: MailMessage | MailListItem, change: { seen?: boolean; flagged?: boolean }) {
    if (!account) return;
    patchMessages((current) => ({ ...current, items: current.items.map((entry) => (entry.uid === target.uid ? { ...entry, ...change } : entry)) }));
    if (openMessage?.uid === target.uid) patchMessage((current) => ({ ...current, ...change }));
    const result = await updateMailFlags({ accountId: account.id, folder: folderPath, uids: [target.uid], ...change });
    if (!result.ok) {
      toast.error(t(`errors.${result.error}`));
      void refreshMessages(true);
    }
    if (change.seen !== undefined) void refreshFolders(true);
  }

  async function remove(target: MailMessage | MailListItem) {
    if (!account) return;
    const index = items.findIndex((item) => item.uid === target.uid);
    const next = items[index + 1] ?? items[index - 1] ?? null;
    if (currentFolder?.specialUse === "trash" && !(await confirm({ title: t("delete.permanentTitle"), description: t("delete.permanentDescription"), confirmLabel: t("actions.delete"), destructive: true }))) return;
    patchMessages((current) => ({ ...current, total: Math.max(0, current.total - 1), items: current.items.filter((entry) => entry.uid !== target.uid) }));
    if (openUid === target.uid) {
      setOpenUid(next?.uid ?? null);
      if (!next) setMobileView("list");
    }
    const result = await deleteMail({ accountId: account.id, folder: folderPath, uids: [target.uid] });
    if (result.ok) toast.success(result.value === "trashed" ? t("delete.trashed") : t("delete.deleted"));
    else toast.error(t(`errors.${result.error}`));
    void refreshMessages(true);
    void refreshFolders(true);
  }

  function reply(source: MailMessage, kind: ReplyKind) {
    if (!account) return;
    setDraft(replyDraft(account, source, kind, {
      wrote: (values) => t("compose.wrote", values),
      forwarded: t("compose.forwardedHeader"),
      from: t("compose.from"),
      date: t("compose.date"),
      subject: t("compose.subject"),
      to: t("compose.to"),
    }, (iso) => formatFullDate(iso, locale)));
  }

  useKeyboardShortcuts([
    { shortcut: MAIL_PAGE_SHORTCUTS.compose, handler: () => { if (account) setDraft(newDraft(account)); } },
    { shortcut: MAIL_PAGE_SHORTCUTS.search, handler: () => { searchInput.current?.focus(); searchInput.current?.select(); } },
    { shortcut: MAIL_PAGE_SHORTCUTS.reply, handler: () => { if (openMessage) reply(openMessage, "reply"); } },
    { shortcut: MAIL_PAGE_SHORTCUTS.replyAll, handler: () => { if (openMessage) reply(openMessage, "replyAll"); } },
    { shortcut: MAIL_PAGE_SHORTCUTS.forward, handler: () => { if (openMessage) reply(openMessage, "forward"); } },
    { shortcut: MAIL_PAGE_SHORTCUTS.delete, handler: () => { if (openMessage) void remove(openMessage); } },
    { shortcut: MAIL_PAGE_SHORTCUTS.toggleRead, handler: () => { if (openMessage) void changeFlags(openMessage, { seen: !openMessage.seen }); } },
    { shortcut: MAIL_PAGE_SHORTCUTS.toggleFlag, handler: () => { if (openMessage) void changeFlags(openMessage, { flagged: !openMessage.flagged }); } },
    { shortcut: MAIL_PAGE_SHORTCUTS.next, handler: () => step(1) },
    { shortcut: MAIL_PAGE_SHORTCUTS.previous, handler: () => step(-1) },
  ], { enabled: Boolean(account) && draft === null && accountDialog === null });

  async function removeAccount() {
    if (!account) return;
    if (!(await confirm({ title: t("account.removeTitle", { address: account.emailAddress }), description: t("account.removeDescription"), confirmLabel: t("account.remove"), destructive: true }))) return;
    await deleteMailAccount(account.id);
    const remaining = accounts.filter((entry) => entry.id !== account.id);
    setAccounts(remaining);
    selectAccount(remaining[0]?.id ?? "");
    if (remaining.length === 0) setAccountId(null);
  }

  function saved(savedAccount: MailAccountSummary) {
    const exists = accounts.some((entry) => entry.id === savedAccount.id);
    setAccounts(exists ? accounts.map((entry) => (entry.id === savedAccount.id ? savedAccount : entry)) : [...accounts, savedAccount]);
    setAccountDialog(null);
    if (!exists) selectAccount(savedAccount.id);
    else void refreshFolders();
    toast.success(exists ? t("account.saved") : t("account.connected"));
  }

  const dialogs = (
    <>
      <AccountDialog
        open={accountDialog !== null}
        onOpenChange={(value) => { if (!value) setAccountDialog(null); }}
        account={accountDialog?.account ?? null}
        defaultName={userName}
        onSaved={saved}
      />
      <ComposeDialog
        draft={draft}
        accounts={accounts}
        onClose={() => setDraft(null)}
        onSent={() => {
          setDraft(null);
          void refreshFolders(true);
          if (currentFolder?.specialUse === "sent" || openMessage) void refreshMessages(true);
        }}
      />
      {confirmElement}
    </>
  );

  if (!account) {
    return (
      <div data-mail-root className="grid h-full place-items-center p-6">
        <div className="rounded-xl border bg-card shadow-card">
          <EmptyState
            icon={<Mail />}
            title={t("empty.title")}
            description={t("empty.description")}
            actions={<Button onClick={() => setAccountDialog({ account: null })}><Plus />{t("account.add")}</Button>}
          />
        </div>
        {dialogs}
      </div>
    );
  }

  const listTitle = query ? t("list.resultsFor", { query }) : folderLabel(currentFolder) || folderPath;

  return (
    <div data-mail-root className="grid h-full min-h-0 grid-cols-1 bg-background md:grid-cols-[200px_minmax(280px,360px)_1fr] lg:grid-cols-[220px_minmax(300px,400px)_1fr]">
      <div className={cn("min-h-0 border-r border-line-soft bg-sidebar/40 max-md:hidden", mobileView === "folders" && "max-md:block")}>
        <FolderPane
          accounts={accounts}
          accountId={account.id}
          folders={folders}
          folderPath={folderPath}
          onSelectAccount={selectAccount}
          onSelectFolder={selectFolder}
          onCompose={() => setDraft(newDraft(account))}
          onAddAccount={() => setAccountDialog({ account: null })}
          onEditAccount={() => setAccountDialog({ account })}
          onRemoveAccount={() => void removeAccount()}
          onRefresh={() => { void refreshFolders(); void refreshMessages(); }}
        />
      </div>
      <div className={cn("min-h-0 border-r border-line-soft max-md:hidden", mobileView === "list" && "max-md:flex max-md:flex-col")}>
        <div className="flex items-center gap-1 border-b border-line-soft px-2 py-1.5 md:hidden">
          <Button variant="ghost" size="sm" onClick={() => setMobileView("folders")}><FolderOpen />{t("folders.label")}</Button>
          <Button size="sm" className="ml-auto" onClick={() => setDraft(newDraft(account))}><Plus />{t("actions.compose")}</Button>
        </div>
        <div className="min-h-0 flex-1 md:h-full">
          <MessageList
            searchRef={searchInput}
            title={listTitle}
            state={messages}
            selectedUid={openUid}
            showRecipients={currentFolder?.specialUse === "sent" || currentFolder?.specialUse === "drafts"}
            query={query}
            unreadOnly={unreadOnly}
            onQueryChange={(value) => { setQuery(value.trim()); setPage(0); setOpenUid(null); }}
            onUnreadOnlyChange={(value) => { setUnreadOnly(value); setPage(0); }}
            onPageChange={setPage}
            onOpen={open}
          />
        </div>
      </div>
      <div className={cn("min-h-0 max-md:hidden", mobileView === "message" && "max-md:block")}>
        <MessageView
          accountId={account.id}
          state={message}
          onBack={() => setMobileView("list")}
          onReply={reply}
          onDelete={(target) => void remove(target)}
          onToggleRead={(target) => void changeFlags(target, { seen: !target.seen })}
          onToggleFlag={(target) => void changeFlags(target, { flagged: !target.flagged })}
        />
      </div>
      {dialogs}
    </div>
  );
}
