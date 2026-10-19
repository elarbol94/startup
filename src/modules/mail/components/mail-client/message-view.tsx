"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Download, Forward, ImageOff, Mail, MailOpen, Paperclip, Reply, ReplyAll, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip";
import { MAIL_PAGE_SHORTCUTS } from "@/lib/app-shortcuts";
import { cn } from "@/lib/utils";
import { formatAddress, senderInitials, type ReplyKind } from "../../mail-utils";
import type { MailAddress, MailMessage } from "../../types";
import { formatBytes, formatFullDate } from "./format";
import { HtmlMailBody, TextMailBody } from "./message-body";
import type { Loadable } from "./use-mailbox";

function AddressLine({ label, addresses }: { label: string; addresses: MailAddress[] }) {
  if (addresses.length === 0) return null;
  return (
    <p className="truncate text-xs text-muted-foreground">
      <span className="mr-1">{label}</span>
      {addresses.map((address) => (address.name ? `${address.name} <${address.address}>` : address.address)).join(", ")}
    </p>
  );
}

export function MessageView({ accountId, state, onBack, onReply, onDelete, onToggleRead, onToggleFlag }: {
  accountId: string;
  state: Loadable<MailMessage>;
  onBack: () => void;
  onReply: (message: MailMessage, kind: ReplyKind) => void;
  onDelete: (message: MailMessage) => void;
  onToggleRead: (message: MailMessage) => void;
  onToggleFlag: (message: MailMessage) => void;
}) {
  const t = useTranslations("mail");
  const tErrors = useTranslations("mail.errors");
  const locale = useLocale();
  const [remoteAllowedFor, setRemoteAllowedFor] = useState<string | null>(null);

  if (state.status === "idle") {
    return <div className="grid h-full place-items-center"><EmptyState icon={<Mail />} title={t("reader.noneTitle")} description={t("reader.noneDescription")} /></div>;
  }
  if (state.status === "loading") {
    return (
      <div className="space-y-3 p-5" aria-busy="true">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (state.status === "error") {
    return <div className="grid h-full place-items-center"><EmptyState icon={<Mail />} title={tErrors(state.error)} description={state.detail} /></div>;
  }

  const message = state.value;
  const messageKey = `${message.folder}:${message.uid}`;
  const remoteAllowed = remoteAllowedFor === messageKey;
  const sender = message.from[0];
  const attachmentUrl = (index: number, download = false) =>
    `/api/mail/attachment?${new URLSearchParams({ account: accountId, folder: message.folder, uid: String(message.uid), index: String(index), ...(download ? { download: "1" } : {}) })}`;

  return (
    <article className="flex h-full min-h-0 flex-col" aria-label={message.subject || t("list.noSubject")}>
      <div className="flex flex-wrap items-center gap-1 border-b border-line-soft px-3 py-2">
        <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onBack} aria-label={t("reader.back")}><ArrowLeft /></Button>
        <ShortcutTooltip label={t("actions.reply")} shortcut={MAIL_PAGE_SHORTCUTS.reply}>
          <Button variant="ghost" size="sm" onClick={() => onReply(message, "reply")}><Reply />{t("actions.reply")}</Button>
        </ShortcutTooltip>
        <ShortcutTooltip label={t("actions.replyAll")} shortcut={MAIL_PAGE_SHORTCUTS.replyAll}>
          <Button variant="ghost" size="sm" onClick={() => onReply(message, "replyAll")}><ReplyAll /><span className="max-sm:hidden">{t("actions.replyAll")}</span></Button>
        </ShortcutTooltip>
        <ShortcutTooltip label={t("actions.forward")} shortcut={MAIL_PAGE_SHORTCUTS.forward}>
          <Button variant="ghost" size="sm" onClick={() => onReply(message, "forward")}><Forward /><span className="max-sm:hidden">{t("actions.forward")}</span></Button>
        </ShortcutTooltip>
        <div className="ml-auto flex items-center gap-0.5">
          <ShortcutTooltip label={message.flagged ? t("actions.unflag") : t("actions.flag")} shortcut={MAIL_PAGE_SHORTCUTS.toggleFlag}>
            <Button variant="ghost" size="icon-sm" onClick={() => onToggleFlag(message)} aria-pressed={message.flagged} aria-label={message.flagged ? t("actions.unflag") : t("actions.flag")}>
              <Star className={cn(message.flagged && "fill-amber-400 text-amber-500")} />
            </Button>
          </ShortcutTooltip>
          <ShortcutTooltip label={message.seen ? t("actions.markUnread") : t("actions.markRead")} shortcut={MAIL_PAGE_SHORTCUTS.toggleRead}>
            <Button variant="ghost" size="icon-sm" onClick={() => onToggleRead(message)} aria-label={message.seen ? t("actions.markUnread") : t("actions.markRead")}>
              {message.seen ? <Mail /> : <MailOpen />}
            </Button>
          </ShortcutTooltip>
          <ShortcutTooltip label={t("actions.delete")} shortcut={MAIL_PAGE_SHORTCUTS.delete}>
            <Button variant="ghost" size="icon-sm" onClick={() => onDelete(message)} aria-label={t("actions.delete")}><Trash2 /></Button>
          </ShortcutTooltip>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <h2 className="mb-3 text-lg leading-snug font-semibold break-words">{message.subject || t("list.noSubject")}</h2>
        <div className="mb-4 flex items-start gap-3">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand-ink">{senderInitials(sender)}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="truncate text-sm font-semibold">{sender ? formatAddress(sender) : t("list.unknownSender")}</p>
              <time className="text-xs text-muted-foreground tabular-nums" dateTime={message.date}>{formatFullDate(message.date, locale)}</time>
            </div>
            <AddressLine label={t("reader.to")} addresses={message.to} />
            <AddressLine label={t("reader.cc")} addresses={message.cc} />
          </div>
        </div>

        {message.html && message.hasRemoteContent && !remoteAllowed ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
            <ImageOff className="size-3.5" />
            <span>{t("reader.remoteBlocked")}</span>
            <Button variant="link" size="xs" className="h-auto p-0" onClick={() => setRemoteAllowedFor(messageKey)}>{t("reader.loadRemote")}</Button>
          </div>
        ) : null}

        {message.html
          ? <HtmlMailBody key={messageKey} html={message.html} allowRemote={remoteAllowed} title={message.subject || t("list.noSubject")} />
          : <TextMailBody text={message.text} />}

        {message.attachments.length > 0 ? (
          <section className="mt-4" aria-label={t("reader.attachments")}>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Paperclip className="size-3.5" />{t("reader.attachmentCount", { count: message.attachments.length })}
            </h3>
            <ul className="flex flex-wrap gap-2">
              {message.attachments.map((attachment) => (
                <li key={attachment.index} className="flex items-center overflow-hidden rounded-lg border text-xs">
                  <a href={attachmentUrl(attachment.index)} target="_blank" rel="noopener" className="flex min-w-0 items-center gap-2 px-2.5 py-1.5 hover:bg-accent">
                    <span className="max-w-[240px] truncate font-medium">{attachment.filename}</span>
                    <span className="text-muted-foreground">{formatBytes(attachment.size)}</span>
                  </a>
                  <a href={attachmentUrl(attachment.index, true)} download={attachment.filename} className="border-l px-2 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={t("reader.download", { name: attachment.filename })}>
                    <Download className="size-3.5" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </article>
  );
}
