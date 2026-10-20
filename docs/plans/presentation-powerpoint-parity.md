# PowerPoint parity: shapes, drawing, handles and shortcuts

Goal: creating on the presentation canvas feels like working on a PowerPoint slide: the
same shapes, the same gallery, the same drawing gestures, handles, text editing and
keyboard shortcuts. Follows `presentation-powerpoint-canvas.md`.

## Sources (2026-10-20)

| Question | Source | Evidence |
| --- | --- | --- |
| Shape geometry, handles, connection sites, text areas | DrawingML preset definitions, ECMA-376 Part 1 (`presetShapeDefinitions.xml`, 187 shapes) | Apache POI copy, `poi/src/main/resources/org/apache/poi/sl/draw/geom/`, SHA-256 `4a762444…c780`, converted by `scripts/generate-preset-shapes.mjs` |
| Gallery categories, order, labels | Live PowerPoint (Microsoft 365, en-US UI): Windows UI Automation tree of the open Insert → Shapes gallery | 9 categories, 172 entries plus "Recently Used Shapes" |
| Label → preset, default insert size | Each gallery entry invoked through UI Automation in a scratch deck; COM `AutoShapeType`, `Width`, `Height`, `Adjustments` read back; `AutoShapeType` → `prst` from a saved deck's XML | All 172 entries inserted |
| Default styles | COM on a hidden scratch deck | see below |
| Keyboard and drawing behaviour | Keys and mouse sent to a scratch deck, state read back through COM | see below |
| Resource strings | REA `inspect-pe-resources` on `PPINTL.DLL` (Evidence `ev_08f909a0…`) | Gallery labels are not stored as plain strings in the intl DLLs; UI Automation was used instead |

## Observed behaviour

- **Units:** a slide is 960 × 540 pt; canvas units are points, so frames match 1:1.
- **Insert by keyboard (gallery item activated):** default size centred on the slide.
  **Click with a shape tool:** default size with its top-left at the click.
  **Drag:** the box from press to release. Defaults are 72 × 72 pt unless listed
  otherwise in the catalogue (for example arrows 77.04 × 38.16, callouts 72 × 48.24).
- **Default shape style:** fill accent 1 (#156082), outline accent 1 shade 15 %
  (#042433) at 1.5 pt, text white Aptos 18 pt, centred both ways, wrapped, insets
  7.2 pt left/right and 3.6 pt top/bottom. **Lines/connectors:** #156082, 1.5 pt.
  **Text box:** no fill, no outline, black Aptos 18 pt, top-left, grows with its text.
- **Arrow keys:** move 0.72 pt (0.01 in) without snap to grid. With snap to grid,
  Arrow moves a grid step and Ctrl+Arrow 0.5 pt.
- **Shift+Arrow:** resizes by 10 % of that side around the centre (Right/Up grow,
  Left/Down shrink: 120 → 132 wide, 80 → 88 tall). **Ctrl+Shift+Arrow:** by 1 %
  (132 → 133.32). **Alt+Left/Right:** rotate by 15°.
- **Ctrl+B / I / U / L / E / R** on a selected shape format all of its text.
  **Ctrl+Shift+> / <** steps the font size along PowerPoint's list (18 → 20, 18 → 16).
- **Tab:** next object. **F2:** toggles text editing (enters with all text selected).
  **Enter:** edits text with all text selected. **Escape:** text → object → nothing.
- **Typing on a selected shape appends to its text** (caret at the end), not replace.
- **Ctrl+D** and repeated **Ctrl+V** on the same slide offset each copy by 12 pt.

## Not verified

- `Ctrl+]`/`Ctrl+[`: the test keyboard has a German layout, so the bracket keys
  could not be sent reliably. Microsoft documents them as font size up/down; this is
  followed.
- Shift (keep proportions) and Ctrl (from the centre) while drawing were not exercised.
- German gallery labels: the scratch PowerPoint runs in English; the German labels
  follow Microsoft's German terminology but were not read from German PowerPoint.

## Verification of the shape engine

`powerpoint-parity/powerpoint-presets.png` is PowerPoint's own export of all 147 preset
shapes of the gallery (COM `Slide.Export`); `powerpoint-parity/canvas-presets.png` is
the same grid drawn by `src/modules/wiki/lib/preset-shapes/preset-geometry.ts`. They are
identical except **Arc**, where PowerPoint's object model sizes the box to the visible
quarter while the DrawingML box is the whole ellipse; the canvas follows DrawingML.
