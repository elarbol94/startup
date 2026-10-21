# PowerPoint parity: grid, guides, Format pane, text and shape tools

Evidence for the second parity pass, taken on 2026-10-20 from desktop PowerPoint (Microsoft
365, English UI, Office theme 2023+) through COM (`PowerPoint.Application`) and Windows UI
Automation on hidden or scratch decks. Scripts and raw dumps lived in the session scratchpad;
the values that matter are copied below and into the code that uses them.

## Grid, rulers and guides

- Grid and Guides dialog (`GridSettings`): *Snap objects to grid*, *Spacing* (8, 6, 5, 4, 3, 2
  grids per cm, 1–5 cm, Custom), *Display grid on screen*, *Display drawing guides on screen*,
  *Display smart guides when shapes are aligned*, *Set as Default*.
- Defaults: spacing 1 cm (28.35 pt), grid hidden, guides hidden, smart guides on.
- Showing guides on a fresh deck shows two guides through the slide centre: horizontal at
  270 pt and vertical at 480 pt (`Presentation.Guides`).
- Shift+F9 toggles the grid, Alt+F9 the guides (PowerPoint shortcut reference).
- In the app the grid and the guides are global to the infinite canvas and anchored at the canvas
  origin. The ruler's zero is the centre of the frame under the viewport centre, the way
  PowerPoint's ruler zero is the slide centre.

## Format Shape pane

The tab and section layout and every choice listed here are the UIA dump of the pane.

- Shape Options → Fill & Line / Effects / Size & Properties; Text Options → Text Fill & Outline
  / Text Effects / Textbox.
- Fill: No, Solid, Gradient, Picture or texture, Pattern (Slide background is not applicable on
  a canvas). Colour and Transparency.
- Gradient default (read back via COM after choosing *Gradient fill*): linear, 90°, four stops
  of the current fill colour at brightness 95 %, 55 %, 55 %, 70 %, positioned at 0, 74, 83 and
  100 %. Brightness b > 0 is DrawingML `lumMod 1−b, lumOff b`; b < 0 is `lumMod 1+b`.
- Pattern: 48 patterns. Each pattern's DrawingML name was read from a saved deck. Its 8×8
  tile was read pixel-exactly from a 96-dpi slide export (`lib/powerpoint-patterns.ts`).
- Line: No, Solid; colour, transparency, width (default 1.5 pt); compound (Simple, Double,
  Thick Thin, Thin Thick, Triple); dash (Solid, Round Dot, Square Dot, Dash, Dash Dot, Long
  Dash, Long Dash Dot, Long Dash Dot Dot); cap (Flat default); join (Miter default); begin and
  end arrow type and size.
- Effects: Shadow (outer, inner, perspective), Reflection, Glow, Soft Edges, 3-D Format (bevel),
  3-D Rotation, each with the parameters of the pane.
- Text Box: vertical alignment (Top, Middle, Bottom, and the three *Centered* variants), text
  direction (Horizontal, Rotate all text 90°, Rotate all text 270°, Stacked), autofit (Do not
  Autofit, Shrink text on overflow, Resize shape to fit text), margins (left/right 0.25 cm, top/bottom
  0.13 cm), Wrap text in shape, Columns.

## Colours

- Office theme: Dark 1 000000, Light 1 FFFFFF, Dark 2 0E2841, Light 2 E8E8E8, Accent 1–6
  156082, E97132, 196B24, 0F9ED5, A02B93, 4EA72E.
- The colour picker grid and its names (*White, Background 1, Darker 5%* …) were copied from the
  picker. Standard colours: Dark Red, Red, Orange, Yellow, Light Green, Green, Light Blue, Blue,
  Dark Blue, Purple. Then *More Colors…* and *Eyedropper*.

## Quick Styles and WordArt

- Shape Quick Styles: 42 *Theme Styles* (Colored Outline, Colored Fill, Light 1 Outline Colored
  Fill, Subtle Effect, Moderate Effect, Intense Effect × Dark 1 and Accent 1–6) and 35 *Presets*
  (Transparent, Transparent Colored Outline, Semitransparent, Colored Fill No Outline, Gradient
  Fill No Outline). The fill, line, shadow and text colour of all 77 were read back by applying
  `Shape.ShapeStyle = 1…77` (`lib/powerpoint-quick-styles.ts`).
- WordArt: the 20 gallery styles are `TextFrame2.WordArtformat = 30…49`. Their names match the
  read-back fill, outline, shadow, glow, bevel and pattern values.

## Text

- Paragraph dialog: alignment, *Before text* indent, special (none, First line, Hanging) with
  *By*, spacing before and after (pt), line spacing (Single, 1.5 lines, Double, Exactly,
  Multiple) with *At*.
- Font dialog: strikethrough, double strikethrough, superscript, subscript, offset, small caps,
  all caps; character spacing (Normal, Expanded, Condensed) by pt. Underline styles: 16 kinds.
  The app keeps a single underline.
- Bullets gallery: None, Filled Round, Hollow Round, Filled Square, Hollow Square, Star, Arrow,
  Checkmark. Numbering gallery: None, 1. 2. 3., 1) 2) 3), I. II. III., A. B. C., a) b) c),
  a. b. c., i. ii. iii.
- List levels: Tab / Shift+Tab at the start of a list paragraph and Alt+Shift+Right/Left change
  the level; each level indents by a further 0.5 inch.

## Shapes and drawing

- Merge Shapes (`ShapeRange.MergeShapes`, read back via COM): Union and Combine give one freeform,
  Intersect keeps the overlap, Subtract removes the other shapes from the primary, Fragment
  returns every piece. The result keeps the *primary* (first selected) shape's formatting.
- Edit Points: vertices can be Auto, Smooth, Straight or Corner points. A vertex can be added
  or deleted, and the path opened or closed (the vertex context menu).
- Lock Drawing Mode (right-click a gallery shape) keeps the tool armed until Escape.
- Change Shape keeps formatting and text; Set as Default Shape makes later shapes use the format.
- Eyedropper picks a colour from the screen. The app uses the browser's EyeDropper where one
  exists (Chromium). Elsewhere, for example in Firefox, it picks the colour of the element that
  is clicked.

## Approximations

- 3-D bevel, 3-D rotation, perspective shadows and reflection are SVG/CSS approximations. They
  are not PowerPoint's renderer.
- Thick Thin and Thin Thick compound lines draw as double lines.
- Merge results are polygons: curves are flattened to short line segments.

## Not verified

- The numbers behind the shadow, reflection, glow and soft-edge presets (blur, distance,
  transparency) are close to PowerPoint's but were not read back preset by preset. The fill,
  line and shadow values of the Quick Styles and WordArt styles were read back.
- The pattern backgrounds of the five WordArt pattern styles are assumed to be white.
- German labels use PowerPoint's German terms where they are known; this German UI has not
  been compared with a German Office installation.
- The Paragraph dialog's alignment and line-spacing lists were not dumped. The standard
  PowerPoint values are used: Left, Centered, Right, Justified, Distributed; and Single,
  1.5 lines, Double, Exactly, Multiple.
