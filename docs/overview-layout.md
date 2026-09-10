# Personal overview

Each user can choose the content and arrangement of their overview. Preferences
are scoped to the signed-in user and saved in this browser, including panel
order, visibility, dimensions, visible columns and sorting. Other tabs receive
storage updates; preferences do not currently synchronize across devices.

## Arrange the page

Choose **Customize layout**. Drag a widget's header to move it; drag its edges
or corners to resize. There are no size sliders, numeric controls or move-arrow
buttons. Edges highlight on hover and can be focused and resized with arrow
keys. Escape/pointer cancellation discards an unfinished resize. Drag handles
support Space, arrow keys, Space to place and Escape to cancel.

Widths resize continuously as a fraction of the workspace; heights follow the pointer in pixels. Alignment guides highlight matching edges and centers while moving or resizing. Panels reflow without overlap. Content
panels have a four-column minimum; cards have a two-column minimum. At narrower
viewports sections stack and keep their saved order. Narrow tables scroll within
their panel. Desktop widths remain saved when viewing the page on mobile.

**Add widgets** opens the catalog. It includes Tasks, Deadlines, News, Calendar,
Documents, Presentations and Projects, plus individual cards for open tasks,
upcoming deadlines, overdue items, the next deadline, today's calendar entries,
document/presentation counts, active projects and unread news. Hidden widgets
retain their saved position and size. Reset restores the default arrangement.
Hiding content never deletes business records.

The calendar shows accessible events/focus entries in the next thirty days and
preserves busy-only redaction. Document rows use the shared wiki's non-deleted
metadata. Presentation metadata is filtered through presentationRole; canvases
and notes are never loaded into these widgets. The project widget shows active
projects. Counts use the same available data; unread news uses an exact count
rather than the limited notification list. All-day/target dates retain their
calendar date across time zones.

## Columns and sorting

In **Customize layout**, **Columns** selects visible columns for every table, including News and the new
sections. At least one column stays visible. Hiding a sorted column removes it
from sorting, so there are no invisible sort priorities.

Click the primary column heading to cycle ascending → descending → unsorted. Clicking
another heading makes it primary, keeping previous sort directions as tie-breakers. Clicking an existing secondary heading promotes it without reversing its direction. Small numbers beside the arrows
show primary/secondary order. **Columns → Reset sorting** clears all priorities.
Drag column headings directly to reorder them in any overview table, including the calendar. Column order is saved independently of widths and visibility. With a heading focused, Alt+Left/Right moves it and Enter sorts it.

Drag the divider at the right edge of any column header to adjust its width. Widths are saved separately for each user and table; Escape cancels an unfinished resize. Keyboard users can focus a divider and use Left/Right. The Filter button sits beside the active filter chips.

Sorting compares numbers naturally, applies secondary rules only within ties,
keeps missing values last in either direction and uses record IDs for stable
final ties. Task/deadline URL parameters retain filter compatibility and accept
older single-sort links as well as `title:asc,assignee:desc` rules.

## Recovery and validation

Existing v1 layouts migrate without resetting the user's section order, sizes
or hidden state. Formerly fixed metric cards are placed before those sections;
new optional widgets start hidden. Corrupt/unsupported data falls back safely,
unknown/duplicate IDs are ignored and dimensions clamped. If storage is blocked,
changes stay usable in the current session and an explicit notice explains that
they could not be saved.

Run `npm run check`. Focused tests cover migration/recovery, edge math,
multi-column ordering, malformed URL rules and hidden-column recovery. Browser
checks cover dragging, edge resizing/cancellation, catalog toggles, columns,
secondary sorting, reload persistence and narrow layouts.

## Metric details

Click any metric card outside edit mode to open its underlying records in a dialog.
Task/deadline metrics remain personal even when the main tables show all users.
The unread-news dialog queries all unread records for that user, not just the
100 most recent notifications. Calendar and presentation details keep their
existing visibility restrictions. Clicking a record opens its details/source.


## Calendar and news filters

Calendar filters cover title, calendar, location and an inclusive date range
within the displayed thirty-day window. News filters cover title, person,
activity, read status and an inclusive date range within the latest 100 entries.
Filters combine with AND, run before sorting, and persist per user/table in this
browser. Each active chip removes one filter; Reset filters clears the set.
Date comparisons use the same timezone as the displayed dates. Busy-only
calendar details are excluded from title/location matching. Filtered table
views do not change the personal metric cards.
