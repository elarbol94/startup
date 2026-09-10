# Using the platform on a phone

Open the usual platform address and sign in. The menu button opens all modules;
the search button opens workspace search directly. Swipe the navigation to scroll,
or hold an item briefly to reorder it. Tap the close button or outside the drawer
to dismiss it. These actions also remain available with a keyboard.

Forms use larger touch targets and readable input text. Dialogs scroll within the
available screen height, including short landscape screens. Browser zoom remains
available. Insets protect the mobile header and bottom controls on devices with
screen cutouts. German and English close labels follow the selected language.

Invoice lines stack into cards with visible labels for description, quantity,
price and VAT. Totals and all accounting calculations retain their existing logic.
Project date fields and company details stack; personnel cost summaries use two
columns on phones. Wide tables and tab bars scroll within their own panels.

Calendar opens in agenda view on phones unless a view was explicitly requested.
Week/month/team remain selectable. Tap an event for details and editing. Projects
provide the existing mobile task list and task dialogs; Kanban columns scroll
horizontally. Hold a card briefly to drag it, or change its column in the task
form. Overview column headings use the same hold-to-drag interaction; ordinary
swipes scroll the table. Document editing retains autosave and its tool menus.

## Validation

Run `npm run check` and `npm run build`. Existing navigation, calendar and invoice
browser regressions live in `e2e/`. Use an isolated database for browser tests.

Verify 320px and 390px phone widths and a 568x320 landscape viewport, with touch
emulation enabled. Check navigation scrolling/reordering, direct search, task
creation and dialog scrolling, invoice entry and totals, calendar creation and
filters, document editing/reload, personnel panels and all settings tabs. Check
both page overflow and clipped descendants: wide content must have its own
scrollable container. Also verify desktop navigation and invoice layout.

The responsive checks emulate browser dimensions and touch input. Actual iOS and
Android keyboard, file-picker and device-specific behavior should additionally
be checked on physical devices; emulation cannot reproduce every OS behavior.
