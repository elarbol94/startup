# Project timeline

Use the grip beside a project or task to move its row. Dropping at the top or
bottom of a task places it before or after that sibling. Dropping in its centre
nests the moving task beneath it. Drop on a project to return a task to the root.
Project rows remain top-level and move with their tasks. Tasks stay in their
existing project. The destination is previewed before release; invalid targets
are marked red. Escape cancels a drag. Scrolling near the panel edges reveals
more rows. At a focused grip, Alt+Up/Down reorders, Alt+Right nests under the
previous sibling, and Alt+Left moves out one level.

Ordering is persisted in SQLite. Task ordering applies across board columns in
the portfolio. Reordering alone does not change dates or task status. Nesting
uses the existing summary rollup behavior. Cycles, milestone containers and new
dependencies between ancestors and descendants are rejected. Pre-existing
conflicts elsewhere do not block unrelated moves.

Dependency lines use compact orthogonal routes, prefer clear lanes around bars,
and penalize crossings and shared segments. Select a connection to expose its
horizontal/vertical route handles; drag or use the handle's arrow keys. Manual
positions that hit bars snap to a nearby clear lane or the automatic route.
“Untangle lines” clears saved offsets only for connections currently rendered.
“Show lines” hides/shows connections; selecting a task dims unrelated lines.
Dense graphs can still have unavoidable crossings; no graph-planarity guarantee
is implied. Schedule dates and dependency types are unaffected by route editing.

Migration 0062 adds only a project sort-order column, defaulting to zero to keep
existing creation order until a project is moved.

Validation: project structure planner/action and routing unit tests; browser
checks cover dragging, keyboard nesting/outdenting, and line controls.
