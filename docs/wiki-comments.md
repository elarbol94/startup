# Source PDF comments

Open an annotation marker or the comments list to read its discussion. Replies
have visible Edit and Delete controls for their author (and administrators).
Deleting a reply asks for confirmation and preserves the PDF annotation, evidence
links and the other replies. Saved deletion survives reloading the reader.

Ctrl/Cmd+Enter sends or saves a reply. While a request runs, its composer is
disabled and repeated submissions are ignored. Failures show an error and retain
the draft for retry. The existing annotation-level Delete/Undo is separate from
permanent deletion of an individual reply.

Focused validation: `src/modules/wiki/pdf-comments.test.ts` and the upload/read/
annotation case in `e2e/zz-pdf-evidence.spec.ts`.
