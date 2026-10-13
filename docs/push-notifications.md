# Push notifications (installed app)

The platform can be installed as an app (Chrome on Android: menu → *Install app*;
iPhone: Safari → Share → *Add to Home Screen*, iOS 16.4+) and then receives Web
Push notifications even when it is closed.

## What is pushed

| Category (profile setting) | Source | Timing |
| --- | --- | --- |
| Assignments, mentions and replies | rows in `wiki_notifications` (task assignments, wiki/office mentions, replies) | within ~30 s of creation |
| Calendar reminders | `calendar_reminders` (incl. recurring occurrences) | when the reminder is due |
| Tasks and deadlines due today | open tasks assigned via `task_assignees` and deadlines via `tasks.assignee_id` with `due_date` = today | once per day, 08:00–18:00 Europe/Vienna |

Each user turns push on per device and picks categories under
**Settings → Profile → Push notifications**. Signing out unbinds the device from
that user; the next user who signs in on it gets the device bound to them.

## Moving parts

- `src/app/app.webmanifest/route.ts`: manifest, linked from the root layout with
  `crossOrigin="use-credentials"` so the fetch carries the Cloudflare Access
  cookie. `src/app/app-icon/[variant]/route.tsx` renders the icons.
- `public/sw.js`: service worker; shows pushes and opens their link on tap. It
  does not cache or intercept requests.
- `src/modules/push/`: schema (`push_subscriptions`, `push_preferences`,
  `push_deliveries`), actions, `send.ts` (web-push, drops 404/410 endpoints)
  and `worker.ts` (30 s tick started from `src/instrumentation.ts`).
- `push_deliveries` makes every push idempotent per user and key, across
  restarts. Calendar reminders additionally share
  `calendar_reminder_deliveries` with the calendar page: an occurrence pushed to
  a device does not show again as an in-app toast.
- Only endpoints of the browser push services (FCM, Mozilla, Apple, WNS) are
  accepted (`endpoint.ts`), because the server POSTs to them.

## Configuration

```bash
npx web-push generate-vapid-keys
```

Put the keys in `.env` (Docker) or `.env.local` (`npm run dev`):

```dotenv
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:office@example.com   # optional, defaults to BETTER_AUTH_URL
```

Restart the app. Without keys push stays off and the profile card says so.
Keep the keys stable: new keys invalidate existing subscriptions (devices are
re-subscribed automatically on their next app load if permission is still
granted).

Push requires HTTPS (or `http://localhost` in development). Push messages reach
devices through the browser vendors' push services, not through the Cloudflare
Tunnel, so Access policies do not affect delivery.
