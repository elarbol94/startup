# Compact multi-page workspace

The tab strip above each application page opens sources, documents, presentations,
projects and other modules through **New tab**. Search uses the existing authenticated
workspace/wiki search; module shortcuts also open pages such as Gemeinden.
The first tab follows normal application navigation. Additional tabs are independent.

On content areas at least 1100px wide, **Show side by side** displays the selected
tab beside another open page. Select another tab to replace the other pane. Drag
the divider to resize; its arrow keys resize in steps and Home/double-click restores
equal widths. On narrower screens the same pages become tabs, and the selected
pair returns when sufficient space is available. Tabs support arrow/Home/End keys.

Added tabs stay mounted when hidden, preserving their local editor state and scroll
position. They are same-origin authenticated app pages with their own navigation
shell suppressed. They do not duplicate the application sidebar or tab strip.
Up to eight additional tabs may remain open; no tabs are silently evicted. Open page addresses and the split layout are restored after reload within the
same browser session, scoped to the signed-in user; document recovery/autosave continues to use existing editor
behavior. Tab closing checks existing beforeunload guards and offers to keep a page
open when its editor reports unfinished changes. It does not add a separate save system.

Only allowlisted app routes can be embedded. Frame location messages require the
current origin and the identity of a registered pane window. Page mutations retain
their existing server authentication and authorization. No database migration is needed.

Validation: `src/components/workspace/model.test.ts`, type checking and lint,
plus browser checks for split panes, small-screen fallback, frame chrome, keyboard
resizing, tab switching, and opening real wiki pages.
