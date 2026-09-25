// Pre-processes clipboard HTML before it reaches the editor schema's own
// DOMParser (see wiki-editor.tsx handlePaste). ProseMirror's schema-aware
// parser already keeps only the nodes/marks each extension's parseHTML()
// rule recognizes and drops everything else - so this module doesn't build a
// tag-by-tag HTML->Tiptap converter, it only removes content the schema
// parser would otherwise happily pass through unchanged (scripts, styles,
// event handlers) or that is imported separately (images), and nudges plain
// <table> markup to match the wiki's markdownTable node.

/**
 * `imageSources` lists the src of every removed <img>, in document order, so
 * the editor can upload them as figures (see wiki-editor/pasted-html-images).
 * Images inside the wiki's own figure markup are not listed: those nodes keep
 * their attributes in data-* and parse back without the <img>.
 */
export type SanitizedPaste = { html: string; hadImages: boolean; imageSources: string[] };

const WIKI_FIGURE = /<figure\b[^>]*\bdata-(?:commentable-image|pdf-evidence)\b[^>]*>[\s\S]*?<\/figure\s*>/gi;
const IMAGE_TAG = /<img\b[^>]*\/?>/gi;
const SRC_ATTRIBUTE = /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
const ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };

function decodeAttribute(value: string) {
  return value.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(amp|quot|apos|lt|gt));/gi, (entity, decimal?: string, hex?: string, name?: string) => {
    if (decimal) return String.fromCodePoint(Number(decimal));
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    return name ? ENTITIES[name.toLowerCase()] : entity;
  });
}

/** The src of every <img> tag in the given HTML, entity-decoded, in order. */
export function pastedImageSources(html: string): string[] {
  return [...html.matchAll(IMAGE_TAG)].map((match) => {
    const src = SRC_ATTRIBUTE.exec(match[0]);
    return decodeAttribute((src?.[1] ?? src?.[2] ?? src?.[3] ?? "").trim());
  });
}

// Elements whose content must never reach the document - either because it's
// executable/style noise (script, style) or because the schema has no node
// for it and ProseMirror would otherwise fall back to dumping their text
// content into the surrounding paragraph.
const STRIPPED_ELEMENTS = ["script", "style", "link", "meta", "iframe", "object", "embed", "noscript", "head", "title"];

/**
 * Sanitizes clipboard HTML for paste into the wiki editor: strips scripts,
 * styles, classes, and event handlers; drops <img> (see imageSources); and
 * marks plain <table> elements so they parse into the editor's table node.
 */
export function sanitizePastedHtml(html: string): SanitizedPaste {
  let output = html;

  for (const tag of STRIPPED_ELEMENTS) {
    output = output.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, "gi"), "");
    output = output.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi"), "");
  }

  // Word/Outlook wrap most of their markup in conditional comments and
  // clipboard fragment markers (<!--StartFragment-->); none of it is content.
  output = output.replace(/<!--[\s\S]*?-->/g, "");

  // The wiki's own figures (copied within or between wiki pages) carry their
  // attributes in data-*, so their <img> is presentation only.
  output = output.replace(WIKI_FIGURE, (figure) => figure.replace(IMAGE_TAG, ""));
  const imageSources = pastedImageSources(output);
  const hadImages = imageSources.length > 0;
  // An <img> points at the source page/machine, not a file we host, so it is
  // never parsed inline; the editor uploads what it can from imageSources.
  output = output.replace(IMAGE_TAG, "");

  // Event handler attributes, any quoting style.
  output = output
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "");

  // Inline styling/classes - none of the schema's parseHTML rules read them
  // for structure, so they'd only smuggle presentation (or styled-span
  // "bold") through. Dropped for simplicity; real <strong>/<em>/<a> etc.
  // still convert normally.
  output = output
    .replace(/\s(?:style|class)\s*=\s*"[^"]*"/gi, "")
    .replace(/\s(?:style|class)\s*=\s*'[^']*'/gi, "");

  // The wiki's table node only recognizes <table data-markdown-table>, so an
  // ordinary pasted table (Word/Excel/Sheets/browser) needs the marker added.
  output = output.replace(/<table\b(?![^>]*\bdata-markdown-table\b)([^>]*)>/gi, '<table$1 data-markdown-table="">');

  return { html: output, hadImages, imageSources };
}
