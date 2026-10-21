# Sharing links

Any page or item can be shared as a link in Element (the Chat section or the
Element apps) or any other chat or mail app. A link never grants access: the
recipient needs an account and permission for the item, the same as for
opening the page directly. Public links for people outside the team are a
separate, per-feature opt-in (for example `/share/presentations/<token>`).

## Where people share from

- **Any page:** the share button in the phone header and in the sidebar next
  to search shares the page in front, including the front workspace tab.
  `Ctrl`/`⌘`+`Shift`+`L` copies its link.
- **Items:** the task dialog, the calendar inspector and the dashboard detail
  dialogs have their own share button.

On touch devices the button opens the system share sheet. On laptops it opens
a menu:

| Entry | Copies / does |
| --- | --- |
| Copy link | the plain URL |
| Copy link with title | `[Title](url)` as text, plus an HTML link for rich editors. Element renders the Markdown as a titled link |
| Share via… | the system share sheet (Chrome/Edge on Windows, Safari on macOS) |
| Share in Chat | copies the titled link and opens `/chat`, ready to paste into a room |

## Links

Pages use their own route. Items without one use a query parameter that their
page understands:

| Item | Link |
| --- | --- |
| Task | `/projects/<projectId>?task=<id>` (or `/?task=<id>`), `canonicalTaskHref` |
| Deadline | `<route>?deadline=<id>`, `withWorkItemFocus` |
| Calendar event | `/calendar?date=<day>&item=<calendar item id>`, `calendarItemShareHref` |
| Project, wiki page, source, PDF | `canonicalEntityHref` in `src/modules/context/routes.ts` |

A new shareable item should get its link from its module (the routes above)
and pass `{ href, title }` to `<ShareMenu>` from `src/components/share/`.
The calendar removes `item` from the address once it has selected the entry,
and tells the recipient when the entry is not in their calendar.

## Opening links

- **Signed out:** `src/proxy.ts` passes the requested path to `requireUser`,
  which redirects to `/login?next=<path>`; after sign-in the person lands on
  the shared item. `safeReturnPath` (`src/lib/return-path.ts`) accepts only
  paths on this site, so `next` cannot redirect elsewhere.
- **Chat section on a laptop:** a click on a platform link inside the framed
  Element opens it in the app window instead of a new tab
  (`src/modules/chat/components/chat-frame.tsx`). Ctrl/⌘/middle click still
  opens a tab.
- **Installed app:** the manifest asks for link capturing
  (`handle_links: "preferred"`, `launch_handler: navigate-existing`). Chromium
  on desktop and Android may then open platform links in the installed app;
  whether it does depends on the browser and on the app the link is tapped in
  (Element Android opens links in an in-app browser tab first). iOS always
  opens links in Safari.
- **Cloudflare Access** still guards every link. A phone that has not signed
  in to Access sees its login first and then the item.

## Link previews

Element shows no preview card for platform links. Synapse would fetch the page
server-side, which Cloudflare Access blocks, and letting it through would store
internal titles on the homeserver; encrypted rooms do not request previews at
all. "Copy link with title" puts the title into the message instead.
