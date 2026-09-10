# Wiki document stability

## Workspace tools

The document opens with its utility panel closed. **Tools / Werkzeuge** opens Outline, Comments, Layout (in document mode), or Details in the same panel. Selecting an image opens its properties. Switching tools keeps comment drafts; on narrower screens the panel is a dismissible drawer. The mode switch is also under Tools. Save status appears beside the document title; export and history are in the header actions menu. Paper size, pagination and exported typography are independent of the workspace styling.

For image insertion, captions, references, figure lists, live folder links and
export behavior, see [wiki-figures.md](wiki-figures.md).

The Wiki editor supports automatic live editing by multiple users, including
character-level text merging, shared layout, collaborator cursors and durable
reconnect recovery. See [live-collaboration.md](live-collaboration.md).

## Comments

Open **Tools → Comments** or comment on a text/image selection. A thread can be
opened with the keyboard using its heading button. Authors can edit or delete
individual messages; **Undo** restores the last deleted message with its anchor.
Comment highlighting is an editor decoration derived from threads with existing
messages; stored anchors alone never highlight text. Deleting the last message
hides its thread and highlight, including immediately
after creating it. Deleted highlights stay hidden when formatting changes or the
document reloads; Undo restores their appearance. Replies from other people are retained. Failed changes show an
error and retain the draft; pending submissions disable their composer.

Focused browser coverage: `e2e/wiki-comments.spec.ts` (comment cases).

## Command search

Tap Shift twice while the editor has focus, or use the search button in the
toolbar, to find editor commands. Type a name or keyword to narrow the list;
Arrow Up/Down selects, Tab completes the name, Enter runs, and Escape closes.
The document selection is retained. Search tolerates small typos when there are
no exact matches and accepts German/English synonyms. Available commands for the
current image, table or text selection rank first; recent commands follow for an
empty search. The last eight command IDs are stored locally per user, without
document text. Toggle commands display their current on/off state. Font size,
line spacing and page margin commands focus their settings directly. Image/table commands explain the required
selection, and editing commands are unavailable when the document is read-only.
Shift used for typing, selecting text or other shortcuts does not open search.
Typing `/` inserts ordinary text; it no longer opens a command menu. Empty
paragraphs have no writing/command placeholder.

Focused checks: `npx vitest run src/modules/wiki/lib/command-search.test.ts
src/modules/wiki/lib/wiki-shortcuts.test.ts src/modules/wiki/lib/slash-commands.test.ts`.
Browser coverage: `npm run e2e -- e2e/reliable-wiki-editor.spec.ts --grep
"double Shift command search"`.

## Text formatting

Use the rich-text toolbar to format documents. Markdown typing shortcuts, paste
conversion, help and export are no longer available. Plain-text Markdown stays
literal; rich HTML paste and HTML, Word and PDF exports remain supported. Existing
formatted content, tables and references retain their stored document schema.

## Linked presentations

Headings used by presentations display a small presentation badge. It opens a list
of the linked frames/elements; the document toolbar also lists links to the whole
page. Following a link saves pending document edits first. Returning from the
presentation can restore the document selection and scroll position.

Opening a section from a presentation expands its collapsed headings and highlights
the destination. Renaming or moving a heading preserves its identity; copying a
heading creates a new one. Missing sections remain explicit instead of being
silently matched to similarly named text. Navigation badges never become document
content and do not appear in exports. See [presentations.md](presentations.md) for
source inheritance, manual linking and access behavior. Presentations also show
a preview and flag saved changes to linked sections, including their subsections.
Authors review body changes in the presentation. Linked frame titles follow heading
renames unless the author has chosen a custom title; other presentation content
is preserved. New document-based presentations also follow newly added subsection
headings inside their linked frames, preserving your canvas arrangement. Existing
decks can enable this in Document source; overlaps require a layout review.

Collapsed sections hide their body, nested headings and internal page breaks through
the next heading of the same or higher level. Hidden blocks and their pagination
spacers do not reserve space. Revealing a section through a presentation link
recalculates pagination without changing document content.

## Tasks and links

Creating a project task from a document selection preserves the document's text,
formatting and structure. Its context stores the selection and quote; returning
from the task selects the original text (or a unique relocated quote). Existing
inserted task references continue to work.

For new tasks created in the document, choosing a project opens its Gantt planner.
The labelled draft row can be moved or resized, or scheduled with the date fields.
Its dates remain local until the task form is saved. Closing/reopening the planner
and switching projects retain those dates. Cancelling the task discards the draft.
Changes to existing tasks in the planner are saved immediately, including when
the new task is later cancelled. The planner uses the existing scheduling actions
and full dependency graph for conflict checks, while showing the chosen project.
Failed schedule reads offer retry without losing the task draft.

After applying an external or wiki link, typing resumes at its end without link
formatting; other text marks are retained. Task-list checkboxes are 14px and
aligned to the first text line, including wrapped and nested items.

Regression coverage: `e2e/document-editor.spec.ts` and
`src/modules/wiki/lib/task-origin.test.ts`.

## Saving and recovery

- Changes are saved as incremental shared updates. Acknowledgements cover only
  the submitted updates; edits made during the request remain pending.
- Reconnect retries and replay are idempotent. Local recovery is isolated by
  account, item and tab, and merges into the current shared state.
- Local storage failures display a warning without stopping server saves.
- Exports wait for pending updates and stop if saving fails.
- History restoration is a shared operation and preserves the replaced state.
- Older whole-document save requests cannot overwrite an initialized shared item.

## Templates and Word import

Templates are prepared on the server and applied inside the editor. The normal
save path handles history, shared updates, versions, citations, backlinks and search
updates. Applying a template preserves existing text unless the author selects
“Replace text with template content”. Saving a template captures the current
editor content and layout, even before the autosave delay has elapsed.

The Word importer preserves spaces around formatting, nested bold/italic marks,
line breaks, nested lists, table paragraphs and unique heading targets. A failed
or malformed import returns an ordinary error. If text changes or editing access
is lost while an import runs, the result is rejected to preserve those edits.

## Spelling and grammar

The **Rechtschreibung / Proofreading** menu selects German, Austrian German or
English directly, shows the check status and opens the next suggestion. Right-click
an underline, press **Alt+Enter** at an issue, or use **Alt+F7** to move to the
next one. Language changes show a saving state until acknowledged and keep
their request alive during navigation. The first correction receives keyboard
focus; Enter applies it and Escape returns to writing. Additional actions include ignoring a hint, adding
a spelling to the shared dictionary, replacing matching marked occurrences,
and disabling a rule.

Checks start after a 250 ms typing pause. Sentences are checked with their
immediate neighbors as context, bounded to 12,000 characters; unusually long
sentences are split without breaking UTF-16 surrogate pairs. Results are cached
by exact context and mapped onto the current document. Unchanged paragraphs
also reuse sentence segmentation. Moving text cannot apply old document offsets.

A lane for the current sentence runs alongside at most one background request.
Background batches contain up to eight contexts and normally at most 4,000
characters (one longer context may run alone). Superseded requests are cancelled;
useful work can finish in the background. Cancellation reaches LanguageTool when
no other editor is awaiting the same shared request. Requests time out after
eight seconds and release their checking lane even if cancellation never settles;
late results from those requests are discarded. Continuous typing is
coalesced, and completed requests do not bypass the typing pause or IME composition.

Editing a word removes its own underline. Converting prose to code or other
excluded content clears its old hints. Other spelling hints remain usable
immediately. Grammar hints whose paragraph changed remain visible but cannot be
applied until their sentence context has been checked again. The count includes
these pending hints; “Checking changes…” distinguishes unfinished checks from
resolved issues. Code, links, inline atoms and deleted suggestions are excluded.
Hard breaks and inline references retain their document offsets.

Suggestions are inserted as plain text, including empty replacements for
deletion. “Replace all” only changes identically marked text with the same rule;
it does not alter unmarked substrings or assume a grammar rule applies in every
context. Shared dictionary filtering happens in the browser, so dictionaries
larger than 500 words do not exceed the checking API's request limit.

LanguageTool runs privately in the Docker Compose `languagetool` service. Local
development needs a reachable `LANGUAGETOOL_URL`; the default Docker hostname
does not resolve outside that network. Text is sent to the configured service.
Browser spellchecking stays disabled to avoid conflicting dictionaries and stuck
red underlines. On failure, the editor shows an unavailable status, retains its
normal save behavior, and retries after 5, 10, 20, then at most 30 seconds. The menu also
offers an immediate retry. Actual checking latency depends on LanguageTool;
the 250 ms debounce is not a service-response guarantee.

Timing diagnostics stay local and contain no document text or page identifiers.
The browser Performance panel exposes the latest `wiki-proofing.queue`,
`wiki-proofing.request`, and `wiki-proofing.apply` measures. Their detail includes
payload size, item count and outcome. Queue duration is time since the latest
edit when the request starts; request duration includes the response body;
apply duration covers matching and publishing current hints. Only the latest
measure for each phase is retained. API responses include `Server-Timing` for
authentication, cache hit/miss/shared status, normalization and total time.
`languagetool` measures the upstream round trip (network plus service processing);
`shared_wait` measures waiting for another request's shared result. The checker
cannot measure LanguageTool's internal processing separately from that hop.

## Validation

Run `npm run check` for TypeScript, lint and the unit suite. Focused regression
coverage is in `src/modules/wiki/actions.test.ts`, `lib/editor-draft.test.ts`,
`lib/document-template.test.ts`, `lib/docx-import.test.ts`,
`lib/spellcheck.test.ts`, `lib/spellcheck-controller.test.ts`, and the spellcheck
API route tests.

Stop the normal development server, then run:

```text
npm run e2e -- e2e/reliable-wiki-editor.spec.ts
```

This uses the throwaway database configured by Playwright. The browser cases
exercise delayed and lost save responses, stale recovery, layout-only recovery,
export after typing, competing editors, paper layout and SVG version recovery.
The SVG case delays preview loading to verify that an early label selection
opens its editor once the preview arrives.
Proofing cases use controlled service responses to exercise delayed checks,
consecutive corrections without losing other hints, stable counts while checking,
and a new edit completing while a background request is still pending,
correction/undo, keyboard and small-screen interactions, safe replacement,
deletion suggestions, dictionary limits, language persistence and outage recovery.
Run only these with `npm run e2e -- e2e/reliable-wiki-editor.spec.ts --grep proofing`.
The document PDF rendering smoke test is `npx tsx scripts/verify-document-pdf.ts`.

## Remaining improvements

- Word interchange is not a lossless document-format conversion. Embedded images,
  complex pagination, advanced layout and all citation/footnote semantics need
  dedicated round-trip coverage and fuller import/export support. Use PDF for
  layout-sensitive delivery.
- Very large documents and long offline sessions need extended performance and
  endurance testing; the regression suite does not establish an unlimited size
  or uptime guarantee.

## Document pagination

Page breaks are measured after the editor mounts and recalculated when its rendered
layout changes, including late fonts, images, shared content and typography settings.
Hidden or zero-width editors wait for measurable layout. Typing is debounced and
IME composition is allowed to finish before pagination decorations are changed.
