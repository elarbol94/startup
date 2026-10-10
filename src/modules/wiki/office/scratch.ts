import crypto from "node:crypto";
import { SCRATCH_KEY_PATTERN } from "./tokens";

/**
 * The section editor ("Abschnitt separat bearbeiten") opens a second editor on
 * a temporary document. It has its own document key (`scratch-<uuid>`), is
 * served as a blank DOCX from memory, and every save callback for it is
 * accepted and discarded: no page, version, attachment or session row.
 * The content travels back to the real document through the workspace plugin.
 */
export function newScratchKey() {
  return `scratch-${crypto.randomUUID()}`;
}

export function isScratchKey(key: string) {
  return SCRATCH_KEY_PATTERN.test(key);
}
