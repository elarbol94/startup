# PowerPoint-grade canvas for presentations

Goal: object handling on the presentation canvas behaves like PowerPoint, while
the infinite canvas, frames and path stay. Scope: core object handling, text
boxes, shapes and lines, and `.pptx` import/export.

## Reference: PowerPoint (desktop, Microsoft 365, observed 2026-10-20)

Observed live on a blank deck. Items marked *(doc)* are documented PowerPoint
behaviour that was not exercised in that session.

| Area | Behaviour |
| --- | --- |
| Click on text box | One click on a text box's text enters text editing immediately: caret at the click point, dashed border, the 8 resize handles and rotate handle stay visible. |
| Escape ladder | Text editing → object selected (solid border) → nothing selected. One level per press. Inside a group: child → group → nothing. |
| Typing on a selection | With a shape selected (not editing), typing starts editing its text. Shapes carry text. *(doc)* Typing replaces existing text. |
| Move | The object follows the pointer live; handles hide during the drag. Smart guides: dashed lines across the slide when centre/edges align with the slide or other objects, with snapping. |
| Resize | A translucent preview of the new box while dragging; the opposite corner/edge is anchored; edge guides appear. *(doc)* Shift keeps aspect ratio, Ctrl resizes from the centre. |
| Rotate | Handle above the top edge. Freeform while dragging (translucent preview). Afterwards, every handle including the rotate handle sits on the rotated box; Width/Height stay the unrotated size. *(doc)* Shift snaps to 15°. |
| Multi-select | Shift/Ctrl-click adds. Each selected object keeps its own handles and rotate handle; there is no union box. Size fields are blank when values differ. *(doc)* Dragging any selected object's handle resizes all of them by the same amount. |
| Marquee | A drag on empty space selects only objects fully enclosed. Partly covered objects stay unselected. |
| Group | Ctrl+G makes one bounding box with its own handles. First click on a member selects the group; a second click drills in and selects that child while the group outline stays visible. *(doc)* Ctrl+Shift+G ungroups. |
| Duplicate | Ctrl+D creates the copy offset down-right and selects it. *(doc)* After moving a duplicate, the next Ctrl+D repeats that offset ("smart duplicate"). |
| Nudge | *(doc)* Arrow keys move by a small step; Ctrl+arrow moves by a fine step. |
| Overflow | A placeholder whose text overflows keeps its size and shrinks the font (24 → 13 pt observed), showing an AutoFit options button at its left edge. *(doc)* Options: shrink on overflow, resize shape to fit, do not autofit. |
| Z-order | Creation order: later objects are drawn above earlier ones. |

Deliberate deviations: we update geometry live instead of showing a translucent
preview (collaborators see the same thing), and we keep the infinite canvas.

## Current editor vs reference

Current architecture: React Flow nodes, TipTap text bound to Yjs, and a reducer
bridged to a `Y.UndoManager`. The full map is in the code under
`src/modules/wiki/components/presentation-editor/` and `src/modules/wiki/lib/`.

| # | Gap or bug | Where |
| --- | --- | --- |
| 1 | Clicks always resolve to the outermost group; there is no drill-in. | `lib/presentation-selection.ts` `selectionTargetId` |
| 2 | Escape clears the whole selection; there is no group/edit ladder. | `presentation-editor.tsx` keyboard handler |
| 3 | For a single rotated object, the rotate handle sits on the axis-aligned box while the resize handles rotate. | `selection-overlay.tsx`, `selectionBounds` |
| 4 | Pressing a group member while other objects are selected collapses the multi-selection. | `applySelectChanges`, React Flow node `selected` |
| 5 | Multi-select has only a bottom-right scale handle. After hitting the size clamp it drifts away from the pointer, and it accepts any mouse button. | `selection-overlay.tsx` |
| 6 | A click on empty space inside a frame selects the frame. That differs from a slide, and is one source of the "frames/path" confusion. | `paneClickSelection` |
| 7 | Escape during a drag leaves `cancelledGesture` set until the next canvas pointerdown. | `presentation-editor.tsx` |
| 8 | Text: a single click on text only selects; editing needs Enter or a double-click. Shapes have no text. Nothing shrinks text on overflow. A stale `editingId` stays after its text is removed. | `use-presentation-text-editing.ts`, `presentation-canvas.tsx` |
| 9 | Ctrl+D has a fixed offset (no smart duplicate). | `use-presentation-selection-edits.ts` |
| 10 | Lines are straight only; connectors exist only through "Verbinden"; there are no adjustment handles. | `presentation-layout.ts`, `presentation-shape.tsx` |
| 11 | `.pptx` export does not exist; import drops crop and group rotation. | `lib/presentation-pptx*.ts` |

## Phases

Each phase adds unit tests for the pure logic and Playwright cases for the
gestures, then runs `npm run check` and the presentation e2e specs.

1. **Core object handling**: group drill-in and the Escape ladder (1, 2); a
   rotation-aware single-selection handle (3); multi-select stability (4); 8
   multi-select scale handles with the clamp fix (5); gesture cancel (7); smart
   duplicate (9).
2. **Text boxes**: click into text to edit at the caret; typing on a selected
   text box or shape starts editing; text inside shapes; autofit modes (shrink on
   overflow / resize shape / off); clear `editingId` when its element disappears (8).
3. **Shapes and lines**: a larger shape gallery, an adjustment handle for corner
   radius, lines that attach to shape connection points when drawn from a
   shape, and elbow and curved connectors (10).
4. **`.pptx`**: export (slides = section frames in path order, with text, shapes,
   images, lines and notes); import keeps image crop and group rotation (11).
5. **Frames and the path** (decided 2026-10-20): treat a section frame like a slide: a click on empty space inside it deselects, as on a slide
   (select a frame by its label or outline), and the Path panel becomes a
   thumbnail rail of frames in playback order, with **New frame** placing the
   next frame beside the last one (6).
