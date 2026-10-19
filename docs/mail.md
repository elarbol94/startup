# Mail

The **E-Mail** section (`/mail`, shortcut `G A`) is a mail client inside the
platform. Each user connects their own mailboxes over IMAP (reading) and SMTP
(sending); nothing is shared between users.

## How it works

- **Accounts** live in `mail_accounts` (`src/modules/mail/schema.ts`). The
  account dialog fills in Hetzner Webhosting (`mail.your-server.de`, IMAP 993
  SSL/TLS, SMTP 587 STARTTLS, login = full address) because the company's
  domains are hosted there; addresses at public providers (Gmail, GMX, …) get
  their servers instead (`presets.ts`). It only saves after logging in to IMAP
  *and* SMTP succeeded.
- **Passwords** are encrypted with AES-256-GCM (`crypto.ts`); the key is derived
  from `BETTER_AUTH_SECRET`. Rotating that secret makes stored mail passwords
  unreadable: users then see "Anmeldung fehlgeschlagen" and re-enter the
  password under *Konto bearbeiten*.
- **No mail is copied into the platform.** Folders, lists and messages are read
  live over IMAP (`imap.ts`); one connection per account is kept open for a few
  idle minutes. The open folder and unread counts refresh every minute while
  the tab is visible.
- **Reading:** HTML mail is sanitised on the server (`sanitize.ts`) and shown in
  a sandboxed iframe without script permission and with a Content Security
  Policy. Remote images (tracking pixels) stay blocked until the reader clicks
  *Bilder laden*. Attachments are served by `GET /api/mail/attachment`.
- **Sending** goes through `POST /api/mail/send` (multipart, attachments up to
  20 MB in total), then a copy is appended to the account's *Sent* folder —
  except for Gmail and Microsoft, which file sent mail themselves. Replies set
  `In-Reply-To`/`References` and mark the original as answered.
- Server actions for everything else are in `message-actions.ts` and
  `account-actions.ts`.

## Limits and known gaps

- Plain-text composing only (no rich text editor), no drafts folder sync.
- Password login only. Personal Outlook.com/Hotmail accounts no longer accept
  passwords over IMAP (Microsoft requires OAuth2), so they cannot be connected
  yet. Gmail, iCloud and Yahoo need an app password.
- Messages above 40 MB are not opened in the reader.
- Mail hosts that resolve to private addresses are refused, so users cannot make
  the server connect to services next to it. Set `MAIL_ALLOW_PRIVATE_HOSTS=true`
  for a mail server in the same LAN.

## Keyboard shortcuts

`N` new email, `/` search, `A` reply, `Shift+A` reply all, `W` forward,
`Entf` delete, `U` read/unread, `M` flag, `J`/`K` next/previous message,
`Strg+Enter` send.
