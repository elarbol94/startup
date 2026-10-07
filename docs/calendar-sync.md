# External calendars (Google Calendar, iCal)

The calendar can show events from Google Calendar or any other iCalendar source
in two ways. Both are reached from **Filters → Add calendar**.

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
