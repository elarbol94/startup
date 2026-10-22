# Wiki presentations

## Workspace tools

The editor separates the document header from its creation toolbar. **Path / Weg** opens the frame rail: a thumbnail per stop in playback order, like PowerPoint's slide pane, with **New frame** adding the next frame beside the last one as a new stop, plus timing and speaker notes. It reopens where it docks if it was left open. Selecting an object keeps the canvas in focus; **Selection actions → Properties** or **Tools / Werkzeuge** opens Properties. Tools also opens Design, Assets or Comments in the same right panel. Narrower screens use dismissible drawers. Sharing, history and playback settings open in dialogs; export and explicit Save are in the header actions menu. Save failures remain visible with panels closed. The presentation library uses noninteractive first-stop previews and a single New menu for templates and PowerPoint import.

Presentations use an infinite canvas and an ordered path of camera stops and
object animations. Content includes text, images, frames, shapes, icons, charts,
uploaded video and audio. The editor, player, previews and PDF export share the
stored content model. Internal editing and live following require sign-in;
owners can explicitly publish a separate read-only link or website embed.

## Comments

**Tools → Comments** lists canvas and object feedback together. Select **Only
comments on selection** to narrow the list explicitly. Authors with commenting
access can edit or permanently delete their own feedback; deletion asks for
confirmation. Resolve/reopen remains available to commenters and editors.
Failed edits retain their draft, and sending disables the composer until completion.

Focused coverage: the comment-management cases in `presentation-actions.test.ts`
and the inspector comment case in `e2e/presentation-studio.spec.ts`.

## Built-in templates

**New → Blank or template** opens a gallery of fourteen complete designs for pitches,
reports, roadmaps, workshops, product demos, portfolios, timelines, topic overviews,
mindmaps and lessons. Select a design, browse every page with the preview arrows,
and choose **Use template**. Selecting and previewing never creates a presentation.
The blank option remains available for a free canvas.

Use **Color palette** beside the preview to keep the original colors or choose Ocean, Forest, Sunset, Plum or Slate. Thumbnails and every preview stop update immediately. The selected palette is applied to the editable elements when creating the presentation; switching templates keeps the palette selection. Existing presentations are unchanged.

Previews use the same editable elements as the created presentation. The ten slide-based designs
include 16:9 frames, coordinated colors, a clear reading order, authoring prompts
and speaker notes in the selected German or English UI language. The entered title
appears on the cover; each frame owns its contents so moving it keeps the layout
together. Metric fields remain placeholders for the author's real values and sources.
Existing presentations retain their saved design. No migration is required.

## Links to document sections

Presentations are no longer linked to document sections. The links belonged to
the old wiki-page editor and were removed together with it (documents are now
Word documents, see [office-documents.md](office-documents.md)). Link data that
older presentations still carry is ignored and stripped from public copies.

## Presentation pointer navigation

Click a form to focus it; click the focused form again to flip into its linked
detail canvas. Shapes or labels standing for a linked frame focus that frame.
Forms without path stops can also be focused. Right-click the canvas to undo one
focus stage; from an unfocused detail canvas, right-click flips back to the
opener in its parent canvas. At the top level it stays in the presentation.
Keyboard navigation and autoplay retain the ordered path, including its detail
detours. Links, media controls and presentation controls keep their normal actions.
Local pointer navigation remains disabled for live followers.

## Reloading a detail page

The current detail section is kept in the editor URL as `?scene=...`, so
reloading restores that section and frames its content after the canvas is
ready. Leaving the section clears the URL value. Missing/deleted sections fall
back to the overview. A fresh overview opens on its first camera stop (or first
frame), so a distant unlinked frame cannot make the initial view appear empty.
The Overview control still fits every element in the current scene.

## Editing and recovery

- Live editing starts automatically for authorized editors, with no editor-count
  cap. Text changes merge character by character, including formatting. Independent
  property changes merge; concurrent changes to one scalar have a deterministic
  shared winner. Deletion wins over a concurrent edit to the deleted identity.
- Names and selected objects show who is working alongside you. Viewports remain
  local. Viewer/commenter access never exposes speaker notes through shared state.
- Inline canvas text and properties text share the same live rich-text fragment.
  Save/Ctrl+S also commits any remaining focused property field.
- Export, Present and editor navigation wait for pending writes. Saved means the
  server acknowledged a durable commit. Reconnect recovery is isolated per account,
  item and tab; local changes remain available during an outage.
- Undo/redo only undoes the current editor's work. Restore publishes a shared
  change and preserves the previous state in history.
- See [live-collaboration.md](live-collaboration.md) for persistence, compatibility,
  API details and dedicated three-user browser tests.
- At most 500 elements and 500 stops are supported. Geometry remains within the
  save schema's limits during group scaling.

On phones and tablets, the path and tools open as drawers over the canvas.
On desktop, the path and the active utility panel dock beside the canvas.

## Structure, animation and content

- Select a frame and choose **Frame inside frame / Rahmen im Rahmen** in the
  creation toolbar to add a centered child at half its size. The child keeps
  the parent's rotation, joins it explicitly, and receives its own path stop.
  Creation selects the child and supports autosave, collaboration and undo/redo.
  Locked frames and frames too small for a valid child cannot receive one.
  While a detail page is open, the ordinary Frame tool and the path rail's
  New frame action also create a child there, so it cannot leak into the overview.

- Select a parent frame in **Structure**, or use **Attach contained objects** to
  connect existing objects inside a frame. Parent links are saved, acyclic and
  independent of visual overlap. Moving or rotating a parent carries its descendants.
  Resizing a section changes only its border, leaving descendant positions and sizes
  unchanged, including when resizing from the top or left. Explicit groups still
  scale their contents. Existing decks keep their layout until explicitly connected.
- Select or drag sections by their outline; empty interiors let clicks and canvas
  panning through. Subsections and other objects remain selectable when their parent
  is selected. Resize using the handles; dragging the selected outline moves it.
- Alignment guides follow the gesture and clear on release, cancellation or leaving
  the window. Resizing snaps only the edges being moved. Each drag, resize or rotation
  is one undo step, even when paused, and consecutive gestures remain separate.
- Shift-click objects, then **Group selection** for a persistent group. Clicking
  a member selects the outer group. Use the object selector to edit an individual
  member's content. Ungroup retains child positions and the surrounding frame, selects
  the released children, and retargets group playback actions to valid children.
- Locking an object prevents direct editing and manipulation. A locked parent
  locks its descendants; a locked child still travels with its parent. Locks are
  an editing aid, not a substitute for presentation access permissions.
- **Animation** inserts reveal/hide actions into the same ordered path as camera
  stops. Choose an action and duration for a path item. Reveals start hidden;
  backwards navigation deterministically restores visibility. Animating a frame
  or group includes its children. Object actions keep the preceding camera view.
- **Content** provides per-span bold/italic/underline/links, font choices, lists,
  image fit/crop/zoom and masks, searchable icons, and editable bar/line/pie charts.
  Charts expose individual values and an expandable data table during playback.
- Upload MP4/WebM video or MP3/M4A/OGG/WAV audio, up to 50 MB per file. Playback
  uses native browser controls and supported codecs; media never auto-plays with
  sound. Hidden media is paused. Files use the existing validated attachment store.
  Inline canvas editing uses the same rich-text model as the inspector and retains
  span-level formatting. Double-click selects all text once; later clicks place the caret.

## Floating text toolbar

Select a text box or a shape with text to show a compact toolbar beside it;
double-click to edit and format a highlighted range. Font size, bold, italic,
underline and color apply to the highlighted text while editing, and to the
whole text otherwise. Font family applies to the box. Vertical alignment
(Top, Middle, Bottom) positions text inside its shape or text box. Alignment, bullets,
numbering and line spacing apply to the selected paragraphs. More text layout
options opens the existing text-properties pane. The toolbar follows pan/zoom,
stays within the canvas, and closes on deselection or its Close button.
Locked objects and read-only presentations do not offer it. Changes use the
existing autosave, collaboration and undo history.

## Copying object formatting

Select one object and press **Ctrl+Shift+C** (Mac: **Cmd+Shift+C**) to copy its
appearance. Select one or more objects of the same type and press **Ctrl+Shift+V**
to apply it. Formatting is available through the keyboard shortcuts.
This session-local formatting clipboard preserves target content, position, size,
hierarchy, media, chart data and connector links. Text formatting includes padding
and automatic fitting; text span overrides are cleared while their text and URLs
are retained. Other types copy their relevant colors, borders, fit or mask settings.
Locked and incompatible targets are skipped. Pasting is one undo step. Normal text
editing shortcuts inside inputs, rich text and dialogs are left to those controls.
The formatting clipboard lasts until this editor is closed or reloaded.

## Layout assistance

A single click selects an object without opening or switching panels. Double-clicking an object opens its Properties panel, including a **Selected element tools** card. Use **Connect to** to choose a target and **Add connector**, without needing multi-selection. Labeled shortcuts jump to appearance, content/media, structure and animation; the panel also has direct buttons for document sources, design, assets and comments. Multi-selection exposes alignment buttons in the same card.

Select two or more objects and open **Arrange / Anordnen** to align their edges
or centers. Three or more objects can be distributed with equal gaps. Rotated
objects use their visible bounds. Frames move with their descendants; selecting
both a frame and a child does not move that child twice. Locked roots cannot be
arranged. Equal spacing leaves an overlapping selection unchanged if there is
not enough room for nonnegative gaps; spread the outer objects first.

With exactly two objects selected, **Connect sections / Bereiche verbinden**
adds an arrow whose endpoints follow their boundaries when they move, resize or
rotate. Select the arrow and use **Detach connector / Verbindung lösen** to
position it freely. Deleting an endpoint detaches its connector at the last
position. Duplicating a connected selection remaps its copied endpoint links.
Existing freehand lines stay freehand. Extremely close or overlapping objects
retain a minimum 20-unit connector, matching the canvas size limits.

Text properties include **Automatically fit text / Text automatisch einpassen**
and text padding. Fitting uses conservative character-width estimates to shrink
text down to 12 units (or its smaller original size) and regrow it up to the
chosen font size when space becomes available. Rich text, explicit line breaks
and lists participate in fitting. A warning asks the author to enlarge the box
or shorten its content if it still does not fit. This is a layout aid rather
than exact font measurement; review the delivery preview for unusual fonts or
scripts. Fitted font sizes and padding are saved, so exports use the same values.

Arrangement, text fitting and connector updates share the existing autosave,
undo and redo history. The optional settings live in canvas JSON; no database
migration is required.

## Precise size, position and frame alignment

Select an object and open **Tools → Properties → Size & position**. Enter absolute
canvas X/Y coordinates, width, height, or rotation. Decimal values are retained,
including movements smaller than half a canvas unit and fractional degrees.
Enter or leaving the field commits one independent undo step; Escape discards the
draft. Save, export and leaving the editor commit the focused field first.
Invalid values leave the object unchanged and show an inline error. Sizes must
remain between 20 and 20,000 canvas units, including all affected group members.
Angles are normalized to the equivalent value between -180 and 180 degrees.

**Lock aspect ratio** applies to numeric width/height changes for the selected
object while its controls stay open. Resizing a section changes its border;
resizing an explicit group also scales its descendants. Moving or rotating either
carries its descendants. Text resizing preserves the chosen font size unless
its existing automatic fitting option is enabled. These controls use the existing
canvas save, collaboration, undo and redo model; no database migration is needed.
Locked objects and descendants of locked parents cannot be changed. Attached
connectors keep derived geometry; detach them before entering coordinates.

**Align within parent frame** aligns one or more selected objects to the nearest
shared containing section. It uses the section's own axes when rotated and the
objects' visible bounds. Groups move with their children, exactly once even if a
child is selected too. The containing frame remains unchanged. Existing **Arrange**
actions continue to align/distribute objects relative to their selection.

Focused validation: `presentation-precision.test.ts` and
`e2e/presentation-precision.spec.ts`; existing presentation interaction, studio,
layout and collaboration suites cover the surrounding workflows. Core editing
continues to use the documented canvas/path model. Locked appearance controls and
rich-text fields remain read-only, including in a collaborative editing session.

## Color selection

Color controls share an Office-style palette with ten base-color columns and
five shades per column, a standard-color row, and custom hex/native color input.
The same picker is used for presentation text, frames, shapes, backgrounds,
charts, icons and company themes, as well as wiki typography, projects, calendars
and categories. Reset/automatic options retain the existing theme or transparent
behavior. Use arrow keys to move between swatches and Enter or Space to select.
Personal annotation identity colors keep their reserved, per-user choices.

## Company designs and assets

- Four spatial starters (topic map, journey, layers and comparison) use nested camera regions on one canvas, with an overview at the beginning and end. Gallery previews include the full canvas and use stop-based navigation. All text is placeholder content, available in German and English.
- Ten slide-based starters cover timeline, hub, pitch, mind map, roadmap, workshop,
  report, demo, portfolio and lesson layouts.
- Save named company themes (background, foreground, accent and font) and reusable
  templates from the inspector. Applying a template replaces the current canvas
  after confirmation and remains undoable. Template copies exclude speaker notes.
- Company designs are intentionally workspace-wide, even when their source deck
  is restricted. Referenced assets are copied into the library, and copied again
  when reused, so deleting the source deck or template does not break those copies.
- Search the accessible local image library and bundled icon catalog. This does
  not include a third-party stock image subscription or remote search provider.

## Access, comments and public sharing

- A deck is workspace-editable by default. Owners can restrict it to selected
  members with View, Comment or Edit roles. Its creator and administrators retain
  owner access. Owners alone manage membership, public links and deletion.
- Viewers/commenters do not receive speaker notes or revision history. Commenters
  can select an object and leave a contextual comment, then resolve/reopen it.
- Public links are disabled by default. Creating one exposes the canvas and its
  referenced media to anyone holding the link, without an application account.
  The generated embed uses that same read-only player. Notes and editing controls
  are not included. Only a hash of the random token is stored; replacing or revoking
  the link immediately invalidates the old URL and its media endpoints.
- Public media endpoints serve only assets referenced by that deck. Direct file
  APIs continue to require authentication and presentation access.
- A surrounding reverse proxy or Cloudflare Access policy still applies. An
  application public link does not bypass that outer access gate. No deployment
  configuration is changed automatically.
- Revocation cannot erase downloaded offline files or copies already made by a
  recipient. Only publish content that is appropriate for that audience.

## PowerPoint import and export

Use **Import PowerPoint** on the presentation list. Each slide becomes a 960 px wide frame with the
deck's aspect ratio (16:9 decks stay 16:9) and a stop named after the slide title. The import
uses `pptxtojson` (server-side only) to resolve placeholder geometry and text styles
through the slide layout and master, then maps the result onto presentation objects:
text boxes with runs, alignment and bullets (one line per paragraph, nested bullets
indented), shapes with fill and outline, images (stored through the regular
attachment upload), tables as grouped text cells (large tables as text), bar/line/pie
charts from the first data series, and speaker notes as stop notes. Geometry and font
sizes share one scale factor, so a slide keeps its proportions. Picture crops become
`fit: cover` with crop position and zoom; rotated or flipped groups are applied to their
members; diagonal or flipped lines and connectors keep their angle and arrowheads.

Import is deliberately not pixel-perfect. Anything the model cannot express is listed
per slide after import (for example "Folie 3: Tabelle als gruppierte Text-Zellen
übernommen"): mixed font sizes in one box, custom shapes, gradients, crops tighter
than the 5× zoom, flipped pictures, SmartArt, equations, unsupported chart types, video/audio and
PowerPoint animations. Packages the full parser cannot read (for example minimal
hand-written archives without `[Content_Types].xml`) fall back to a simpler direct
reader. External relationships are never fetched. Limits: 50 MB compressed file, 100
slides, 500 objects, 100 MB total expanded archive, 25 MB per archive entry, 5 MB per
XML part, no DTDs/entities; the archive is checked against these limits before any
parser sees it. The test deck is generated by `scripts/fixtures/make-import-sample.py`.

**Actions → PowerPoint (.pptx)** in the editor header saves pending edits and downloads
the deck (`GET /api/wiki/presentations/[id]/pptx`, same sign-in and access rules as the
offline export; view-only readers get no speaker notes). Each path stop on a section frame
becomes one 16:9 slide in path order (fade steps are skipped); without frame stops each
camera stop becomes a slide, and without stops one slide fits all content. A frame is
scaled uniformly onto the slide and takes its descendants plus every object whose centre
lies inside it. Exported natively: text boxes with runs (bold, italic, underline, colour,
links), font, size, alignment and bullet/number lists; rectangles, rounded rectangles,
ellipses, triangles and diamonds with fill, outline, dash and opacity; lines and arrows as
straight connectors with arrowheads; rotation; groups; pictures (PNG, JPEG, GIF, WebP,
BMP) embedded with crop and circle/rounded/diamond masks; slide backgrounds; the frame
label as slide name; stop notes as speaker notes. Charts, icons, video, audio, SVG and
missing pictures become labelled dashed placeholders, and the editor says so after the
download. Animations, comments and the infinite canvas outside the slides are not
exported. The code is `lib/presentation-pptx-export*.ts`; the unit tests include a
round trip through the importer, and `e2e/presentation-pptx-export.spec.ts` covers the
download.

## Presenting and exporting

- Arrow keys, Page Up/Down and Space navigate stops. Space on a focused control
  activates that control once. Home shows the overview. Escape leaves the player
  when browser fullscreen is inactive.
- Presenter notes windows have a channel specific to the player that opened
  them, so two players of the same presentation do not steer each other.
- Presenter view includes visual current/next previews, per-step editable notes
  with conflict checks and revision recovery, and pause/resume/reset timer controls.
- Live followers start at the host's current stop. Their keyboard and camera
  gestures do not override the host, and speaker notes are not sent to them.
  Host updates and stop requests use the fixed `/api/wiki/presentations/[id]/live`
  endpoint so navigating away cannot send them to an unrelated route.
- Reduced-motion preferences disable camera flights and entrance fades.
- PDF export preserves the chosen canvas background and fits rotated targets.
  Speaker notes are excluded by default; **Include speaker notes** opts in for
  a presenter copy.
- **Download offline presentation** produces one self-contained HTML file with
  interactive camera navigation, reveal/hide playback, charts, images and media.
  Open it directly in a modern browser without reaching this server. No external
  fonts, application JavaScript or CDN are required. It contains no speaker notes.
  Referenced media must be available and total at most 100 MB; larger decks should
  reduce media first. Native browser codec/fullscreen restrictions still apply.

## Validation

`npm run check` runs TypeScript, lint and unit tests. Presentation storage tests
use an in-memory database and the actual presentation migrations. The browser
suite is `npm run e2e -- e2e/wiki-presentations.spec.ts e2e/presentation-studio.spec.ts`; it uses the disposable
database described in the README and covers editing, autosave, restore, mobile
layout, rotation, PDF notes, edit leases, live following, hierarchy, rich content,
animations, simultaneous editors, roles, comments, company designs, public links,
offline media and presenter previews/notes/timers.

Migration `0055_redundant_nebula.sql` adds access settings, membership, comments and
the design library. Existing canvases remain backwards-compatible. Deploy through
the normal manual workflow on `banond` (see AGENTS.md) after validation; do not
deploy automatically.

The Properties inspector uses exclusive collapsible sections: opening Appearance, Content & media, Structure, or Animation closes the others. Connectors and multi-object arrangement are collapsed groups; a compact selector switches workspace panels.

Inspector tools follow the selection: Content is shown only for text, images, charts, icons and media; grouping and alignment require multiple objects; connected arrows expose line styling and detaching. Animation step settings only refer to the selected object. Canvas settings appear with no selection.

### Editor command search

Two short Shift taps on the presentation canvas or rich text open presentation commands. The toolbar offers the same searchable menu, with arrow-key navigation, Enter to run and Escape to return to the previous focus and selection. Insert, duplicate/delete, undo/redo, overview, panels, save and history use the existing editor actions and permission guards. Ordinary form fields and open dialogs do not trigger the shortcut; outside editor scopes double Shift retains app navigation.


## PowerPoint-style object editing

Left-drag on empty canvas or inside an empty frame draws a full-containment selection
rectangle. Shift adds to selection. Space+drag or the middle mouse button pans. Grid
dots remain attached to canvas coordinates and use coarser/finer powers-of-two intervals
as zoom changes, without changing alignment snapping.

Selection follows PowerPoint. A click selects an object, the outermost group around it
for a group member; a second click on a selected group selects the member under the
pointer, and siblings stay directly selectable while working inside the group. Escape steps
out one level at a time: text editing → object → its group → nothing. A click on empty
canvas clears the selection, including inside a frame: frames behave like slides and are
selected by their outline or label. Pressing any member of a selected group drags the whole
selection.

A single click on an already selected text box or shape edits its text with the caret at
the click. Typing while a text box or closed shape is selected replaces its text (so the
single-letter tool keys apply only without such a selection). Double-click, or Enter, edits
with all text selected. Closed shapes hold text like text boxes; its size, bold, alignment
and colour are under **Text** in the shape's properties. Typing and dialog shortcuts remain
local to their controls; save also commits a focused property field.

Several selected objects each show an outline, and eight handles on the box around all of
them scale them together (Shift on a corner keeps proportions, Alt scales from the centre).
A single rotated object keeps its rotate handle on its own rotated top edge.

Ctrl/Cmd+drag duplicates the selected hierarchy at the drop location. On Mac, Option+drag
also copies. Originals stay fixed; previews are local until release. Shift constrains drag
movement to one axis. Escape, pointer cancellation, or loss of window focus discards a copy
gesture. A completed copy gesture is one undo step. Shift-resize preserves proportions.

**Selection actions**, right-click, and Shift+F10 expose applicable object commands.
Right-clicking an existing selection retains it; another object becomes selected first.
The empty-canvas menu offers insertion, paste, select all, overview, and shortcut help.
Grouping and ungrouping share the same implementation across keyboard, menus and inspector.

Windows/Linux use Ctrl, macOS uses Cmd for these object shortcuts:

| Shortcut | Action |
| --- | --- |
| Ctrl+C / X / V | Copy / cut / paste presentation objects |
| Ctrl+D | Duplicate 12 pt down and right; after moving the copy, the next Ctrl+D repeats that move |
| Ctrl+A | Select canvas hierarchy roots |
| Ctrl+G / Ctrl+Shift+G | Group / ungroup |
| Arrow / Ctrl+Arrow | Move by 0.72 pt |
| Shift+Arrow / Ctrl+Shift+Arrow | Resize by 10 % / 1 % around the centre (Right/Up grow) |
| Alt+Left / Alt+Right | Rotate by 15° |
| Ctrl+B / I / U, Ctrl+L / E / R | Bold, italic, underline, alignment of all text of the selection |
| Ctrl+] / Ctrl+[, Ctrl+Shift+> / < | Font size up / down PowerPoint's size list |
| F2 | Enter / leave text editing |
| Tab / Shift+Tab | Next / previous object while canvas has focus |
| Ctrl+Shift+] / Ctrl+Shift+[ | Front / back |
| Enter / Escape | Edit text / step out one level (editing, group, selection) or cancel a gesture |
| Delete / Backspace | Delete selected objects |
| Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z | Undo / redo |
| Ctrl+S | Save |
| Ctrl+Shift+C / V | Copy / paste object formatting |

Clipboard objects use a bounded, versioned JSON envelope. Pasting validates the complete
hierarchy and element limit before insertion, preserves rich text, and assigns fresh IDs.
Internal connectors are remapped; connectors to objects outside the copied selection become
free lines. Media is fetched through the authenticated file API and copied into the destination
presentation through the existing validated upload API before objects are inserted. Failed
pastes insert no objects; browser clipboard permission may be required. External PowerPoint
clipboard formats are not supported; use PowerPoint import for those files.

**Shapes / Formen** opens PowerPoint's shape gallery: "Recently Used Shapes" and PowerPoint's
eight categories (Basic Shapes, Lines, Arrows, Callouts, Symbols, Flowchart, Stars and Banners,
Buttons) with all 172 entries in PowerPoint's order and names. Every preset is drawn from the
DrawingML preset definitions PowerPoint uses (`src/modules/wiki/lib/preset-shapes/`), including
all of its yellow handles, its own connection sites and its text area. With a tool armed, a click
inserts PowerPoint's default size at the click, a drag spans the box (Shift keeps proportions,
Ctrl draws from the centre), lines and connectors run from press to release and glue to the shapes
they touch, a scribble draws freehand, and a freeform or curve takes clicked points (double-click
or Enter finishes, a click on the first point closes it). Escape disarms the tool. New shapes take
PowerPoint's default style (fill #156082, 1.5 pt outline #042433, white 18 pt Aptos text). Ctrl+V
pastes in place, 12 pt down and right of the copy and cascading; the context menu pastes at the
click. PowerPoint files keep presets and their adjustment values in both directions.

**Insert → Chart** and **Icon** open choices before adding an object. Older decks' shapes include
rectangles, rounded rectangles, ellipses, triangles, diamonds, pentagons, hexagons, stars,
parallelograms, trapezoids, chevrons, speech bubbles, plus signs, lines, arrows, and
double-headed arrows. A selected adjustable shape shows a yellow handle for its corner
radius, slant, notch, tail or inner radius. Closed shapes have resize and rotation controls,
with a corner-radius field for rounded rectangles.

Lines/arrows use two endpoint handles. Dropping an end on another object glues it to that
object's nearest connection site (top, right, bottom or left, shown while dragging); a glued
end is green and follows the object. Dropping it on empty canvas, or deleting the object,
leaves that end free; Shift keeps a free end on 45-degree steps. **Line route** switches a
line between straight, elbow and curved. Line styling includes thickness, dash pattern and
opacity, plus start/end head styles and head size.

Optional styling fields are stored in the existing canvas JSON. Legacy decks keep their defaults;
no database migration is needed. The shared SVG renderer serves editing, playback, previews,
PDF print, and offline HTML. New focused coverage lives in `e2e/presentation-interactions.spec.ts`
and the presentation interaction, rendering, and collaboration bridge unit tests.

## Format pane, text formatting, grid and guides

Evidence and approximations: `plans/presentation-powerpoint-formatting.md`.

- **Format ribbon.** While shapes or text are selected, a ribbon row below the toolbar holds:
  - shape tools: Quick Styles (all 77 of PowerPoint's shape styles), Shape Fill, Shape Outline, Change Shape, Edit Points and Merge Shapes (Union, Combine, Fragment, Intersect, Subtract);
  - text tools: WordArt (the 20 styles), bullets and numbering (PowerPoint's galleries), list level, line spacing, Align Text, text direction, columns, strikethrough, superscript/subscript, character spacing, highlight and font colour.

  While a text is being edited these tools act on the selected paragraphs and characters; otherwise they act on all of its text.
- **Format Shape pane.** Open it with the ribbon's "Formatbereich" button, "Form formatieren" in the context menu, or the command search. It sits in the properties panel and follows PowerPoint's pane:
  - **Fill & Line:** no, solid, gradient (stops, angle, linear/radial), picture (uploaded to this deck, stretched or tiled) and the 48 pattern fills; line colour, transparency, width, compound type, dash type, cap, join and arrowheads.
  - **Effects:** shadow (outer, inner and perspective presets), reflection, glow, soft edges, 3-D bevel and 3-D rotation.
  - **Text Options:** Text Fill & Outline and Text Effects (the WordArt layer); the Text Box section (vertical alignment, text direction, autofit, margins, wrap, columns); and the Paragraph and Font dialogs as sections.
- **Colours.** The colour menu is PowerPoint's: Office theme colours with their tints and shades, Standard Colors, Recent Colors, More Colors… and the Eyedropper. Chromium browsers use the browser's eyedropper; elsewhere the next click on an object takes its colour.
- **Grid, rulers and guides** (View menu, "Raster und Führungslinien"):
  - Shift+F9 shows the grid and Alt+F9 the drawing guides; showing guides for the first time adds two through the centre of the frame in view.
  - The grid and guides are global to the canvas and anchored at its origin; the ruler measures in cm from the centre of the frame in view.
  - Drag from a ruler to add a guide. Ctrl+drag a guide to copy it, and drag it off the canvas to remove it.
  - The grid dialog sets snapping and spacing (default 1 cm) and turns smart guides on or off. Hold Alt while dragging to ignore every snap.
- **Shape tools:**
  - **Lock Drawing Mode:** right-click a gallery shape; the tool stays armed until Escape.
  - **Set as Default Shape / Line / Text Box:** in the context menu; new objects of that kind start with that format, stored with the presentation.
  - **Edit Points:** turns the shape into a freeform with editable vertices and handles.
  - **Merge Shapes:** keeps the first selected shape's format.
- **Files and export.** Picture fills are files of the deck: they are checked on save, copied with the deck and exported to `.pptx`. The `.pptx` export writes the fills, lines, effects, text body, paragraphs and run formats as DrawingML; the import reads back what `pptxtojson` exposes.

## Placement, spacing, navigation, and text sizing

Insertion tools prepare a translucent preview under the cursor. Click the canvas to place
it, press Escape to cancel, or focus the canvas and press Enter to place at its center.
Uploaded media and library assets follow the same placement flow. Connected lines are
created directly between their chosen endpoints.

Moving and Ctrl/Cmd-dragging copies share alignment and equal-gap guides. Matching gaps
show dimension lines with distances in canvas units. Frames are compared as containers,
so their headings do not generate competing gap measurements. Rotation magnetically snaps
to horizontal/vertical and parallel/perpendicular object angles within four degrees.
Shift rotates in 15-degree increments; Alt allows free rotation.

The minimap draws enclosing frames as outlines so nested content remains visible in light
and dark themes. Click a minimap location to center that world position without changing zoom.

Editing text or increasing its font keeps the chosen box width and grows vertically when
needed, without shrinking manually allocated space or reducing font size. Sentences wrap
within that width. Explicit line breaks, rich formatting, and rotated top-left anchors are
preserved. Existing automatic font fitting remains an alternative and suppresses box growth.
Changes use the existing shared geometry, saving, undo, and export paths.

## Links to PDF source passages

Prepare a passage with **Link source passage** in the PDF reader. While editing
text on the canvas or in Properties, select the target words and use the
source-passage link icon. This applies a normal rich-text link without replacing
the words. It participates in collaborative editing, saving and undo.
Ctrl/Cmd+click in the editor returns to the source passage; source viewing requires
sign-in. In the PDF source reader, prepare a passage with the link icon
(**Quelltextstelle verknüpfen / Link source passage**); the most recently prepared
passage is available in other tabs on the same origin and replaces the previous one.

## Object controls and smart guides

Rotation controls stay above overlapping content and above the visible selection bounds,
including rotated symbols. Eight resize handles follow each object's rotation; dragging
an edge keeps the opposite edge fixed. Text reflows at the new width without changing its
font size. Image and symbol corners preserve proportions by default (Shift releases them);
Shift constrains text/shape corners. Alt resizes around the centre. Escape cancels a gesture,
and undo treats each completed gesture as one edit.

Dashed alignment guides use visible rotated bounds, retain a matched line through small
pointer movements, and release when dragged away. A closer edge or centre alignment wins
over a competing equal-spacing suggestion. Guides and handles retain their screen sizes
at different zoom levels. Rotated, proportional and centred resizing bypasses edge snapping
to preserve the fixed anchor and proportions.
