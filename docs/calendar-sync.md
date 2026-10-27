# External calendars (Nextcloud, Google Calendar, iCal)

The calendar can sync both ways with Nextcloud, and show events from Google
Calendar or any other iCalendar source read-only or as a one-time copy. All are
reached from **Filters → Add calendar**.

## Nextcloud (two-way CalDAV sync)

*Sync with Nextcloud…* connects the user's own account on the Nextcloud set in
`NEXTCLOUD_URL` (the same instance as the Cloud tab) with a login name and an
**app password** (Nextcloud → Personal settings → Security → *Create new app
password*).

- Pick a Nextcloud calendar in the dialog to create a matching app calendar,
  or choose *Sync to Nextcloud* in an existing calendar's menu to create a new
  Nextcloud calendar from it. Read-only (shared) Nextcloud calendars and
  subscribed feeds cannot be linked.
- Events stay editable on both sides. The server syncs every linked calendar
  every minute (`startCaldavSync`, started from `src/instrumentation.ts`);
  *Sync now* in the calendar's menu runs it at once.
- Each run pulls first with RFC 6578 `sync-collection` (only changes since the
  last sync token; a full listing when the token expires), then pushes local
  creates, edits and deletions with `If-Match`/`If-None-Match` ETags. When both
  sides changed the same event, **the Nextcloud version wins**.
- Title, description, location, times, all-day, recurrence (including moved
  and cancelled occurrences) and free/busy are synced. App-only data (event
  kind, address, linked task, attendees, reminders) stays local and survives
  remote edits. Deleting an event on either side deletes it on the other.
- *Stop syncing with Nextcloud* and *Disconnect* only stop the exchange; both
  copies are kept. Deleting an app calendar never deletes the Nextcloud one.
- The app password is encrypted like mailbox passwords (`mail/crypto.ts`,
  key from `BETTER_AUTH_SECRET`) in `calendar_caldav_accounts`, which the
  version journal excludes. Requests only ever go to the `NEXTCLOUD_URL`
  origin. After a rejected login the background sync pauses that user's
  calendars (avoiding Nextcloud's brute-force lockout) until a new app
  password is saved or *Sync now* is used.
- The app server must reach `NEXTCLOUD_URL` itself (not just the browser).

## Subscription (read-only mirror)

*Subscribe to Google Calendar…* takes a calendar's **Secret address in iCal
format** (Google Calendar → Settings → the calendar → *Integrate calendar*).
`webcal://` links and other iCal feeds work too.

- A new calendar is created and mirrored from the feed. Its events are
  read-only in the app (`requireCalendarEditor` refuses them); change them in
  Google Calendar.
- The server re-syncs every subscription every 30 minutes
  (`startCalendarSubscriptionSync`, started from `src/instrumentation.ts`).
  Owners can also choose *Sync now* in the calendar's menu. Google itself
  refreshes the secret feed only every few hours, so changes can lag.
- Events are matched by iCalendar `UID` and updated in place, so reminders
  keep working. Vanished events are deleted. Unchanged events are not rewritten,
  which keeps the version journal quiet. Single events that ended more than a
  year ago are not mirrored; recurring series are always kept, with moved
  (`RECURRENCE-ID`) and cancelled (`EXDATE`) occurrences mapped to occurrence
  exceptions.
- The feed URL is a credential. It lives in `calendar_subscriptions`, which the
  version journal excludes. Only its host leaves the server, and only the
  owner can sync, replace it (*Edit calendar* → *New secret address*) or remove the
  subscription. Removing it deletes the mirrored calendar here, not in Google.
- Downloads go through `fetchPublicText` (no private network targets, max.
  20 MB, three redirects).

## One-time import

*Import calendar file…* uploads an `.ics` file or Google's export `.zip`
(Settings → *Import & export* → *Export*) to `POST /api/calendar/import`. It
copies the events into a calendar you can edit. They stay ordinary editable
events afterwards. Re-importing skips UIDs the calendar already has, so local
edits are kept.

## Code

- `src/modules/calendar/ics-feed.ts`: pure iCalendar parser (all `VEVENT`s,
  time zones, `RRULE`/`EXDATE`/`RECURRENCE-ID`).
- `src/modules/calendar/ics-sync.ts`: upsert/mirror logic, feed download,
  background worker, upload unpacking.
- `src/modules/calendar/subscription-actions.ts`: subscribe, replace URL,
  sync now, remove.
- `src/modules/calendar/ics-write.ts`: serializes an event with its
  occurrence exceptions back to iCalendar (for CalDAV pushes).
- `src/modules/calendar/caldav-client.ts`: CalDAV requests (discovery,
  listing, sync report, multiget, PUT/DELETE, MKCALENDAR).
- `src/modules/calendar/caldav-sync.ts`: two-way sync engine and worker.
- `src/modules/calendar/caldav-actions.ts`: connect, link, push, sync now,
  unlink, disconnect.
