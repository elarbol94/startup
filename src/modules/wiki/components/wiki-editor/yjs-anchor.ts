// Document positions that survive collaborative edits. A remote Yjs update is
// applied to ProseMirror as one whole-document replace step, so a plain
// `tr.mapping.map(position)` collapses every stored position to the document's
// edges. A Yjs relative position instead points at an item in the shared type
// and resolves to the right place however the document has changed since.
import type { EditorState, Transaction } from "@tiptap/pm/state";
import type { Mapping } from "@tiptap/pm/transform";
import { absolutePositionToRelativePosition, relativePositionToAbsolutePosition, ySyncPluginKey } from "@tiptap/y-tiptap";

type RelativePosition = ReturnType<typeof absolutePositionToRelativePosition>;
export type DocumentRange = { from: number; to: number };
export type AnchoredRange = DocumentRange & { relative: { from: RelativePosition; to: RelativePosition } | null };

// The binding is only present once the sync plugin's view has initialised.
type SyncState = {
  doc: Parameters<typeof relativePositionToAbsolutePosition>[0];
  type: Parameters<typeof relativePositionToAbsolutePosition>[1];
  binding?: { mapping: Parameters<typeof relativePositionToAbsolutePosition>[3] } | null;
};

function syncState(state: EditorState) {
  const value = ySyncPluginKey.getState(state) as SyncState | undefined;
  return value?.binding ? value as SyncState & { binding: NonNullable<SyncState["binding"]> } : null;
}

export function clampRange(range: DocumentRange, size: number): DocumentRange {
  const from = Math.max(0, Math.min(range.from, size));
  const to = Math.max(0, Math.min(range.to, size));
  return from <= to ? { from, to } : { from: to, to: from };
}

/** Maps a range through local steps; text typed at either edge stays outside it. */
export function mapRange(range: DocumentRange, mapping: Pick<Mapping, "map">): DocumentRange {
  const from = mapping.map(range.from, 1);
  const to = mapping.map(range.to, -1);
  return from <= to ? { from, to } : { from: to, to: to };
}

/** Anchors a range of the current state, which must be in sync with the Yjs document. */
export function anchorRange(state: EditorState, range: DocumentRange): AnchoredRange {
  const clamped = clampRange(range, state.doc.content.size);
  const sync = syncState(state);
  if (!sync) return { ...clamped, relative: null };
  try {
    return {
      ...clamped,
      relative: {
        from: absolutePositionToRelativePosition(clamped.from, sync.type as never, sync.binding.mapping),
        to: absolutePositionToRelativePosition(clamped.to, sync.type as never, sync.binding.mapping),
      },
    };
  } catch {
    return { ...clamped, relative: null };
  }
}

/** Resolves an anchored range against a state whose Yjs mapping is current. */
export function resolveAnchoredRange(state: EditorState, range: AnchoredRange): DocumentRange | null {
  const sync = syncState(state);
  if (!sync || !range.relative) return clampRange(range, state.doc.content.size);
  const from = relativePositionToAbsolutePosition(sync.doc, sync.type, range.relative.from, sync.binding.mapping);
  const to = relativePositionToAbsolutePosition(sync.doc, sync.type, range.relative.to, sync.binding.mapping);
  if (from === null || to === null) return null;
  return clampRange({ from, to }, state.doc.content.size);
}

export function isRemoteTransaction(transaction: Transaction) {
  return Boolean((transaction.getMeta(ySyncPluginKey) as { isChangeOrigin?: boolean } | undefined)?.isChangeOrigin);
}

/**
 * Carries an anchored range through one transaction. Local steps are mapped
 * directly (the Yjs document has not seen them yet); a remote update resolves
 * the relative positions, whose mapping y-tiptap rebuilds before dispatching.
 */
export function applyToAnchoredRange(range: AnchoredRange, transaction: Transaction, state: EditorState): AnchoredRange | null {
  if (!transaction.docChanged) return range;
  if (isRemoteTransaction(transaction) && range.relative) {
    const resolved = resolveAnchoredRange(state, range);
    return resolved ? { ...resolved, relative: range.relative } : null;
  }
  return { ...clampRange(mapRange(range, transaction.mapping), transaction.doc.content.size), relative: range.relative };
}
