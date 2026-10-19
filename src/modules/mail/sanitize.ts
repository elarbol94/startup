import sanitizeHtml from "sanitize-html";

/**
 * Cleans an HTML mail body for display. The result is additionally rendered
 * in a sandboxed iframe without script permission and with a Content Security
 * Policy (components/mail-client/message-body.tsx), so this is the first of
 * two layers: it removes scripts, forms, frames and event handlers and makes
 * links open in a new tab.
 */
export function sanitizeMailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      "img", "style", "font", "center", "span", "div", "table", "thead", "tbody", "tfoot", "tr", "td", "th",
      "colgroup", "col", "caption", "u", "s", "strike", "small", "big", "sup", "sub", "hr", "br",
    ],
    allowedAttributes: {
      "*": ["style", "class", "id", "align", "valign", "width", "height", "bgcolor", "color", "dir", "lang", "title", "border", "cellpadding", "cellspacing", "background"],
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "width", "height"],
      font: ["face", "size", "color"],
      td: ["colspan", "rowspan", "nowrap"],
      th: ["colspan", "rowspan", "nowrap"],
      col: ["span"],
      ol: ["start", "type"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel", "data", "cid"],
    allowedSchemesByTag: { img: ["http", "https", "data", "cid"] },
    allowProtocolRelative: false,
    allowVulnerableTags: true, // <style> is needed for most newsletters; the iframe CSP contains it.
    nonTextTags: ["script", "noscript", "textarea", "option", "title", "head", "iframe", "object", "embed"],
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer" },
      }),
    },
  });
}

const remotePattern = /(\bsrc\s*=\s*["']?\s*https?:|\bbackground\s*=\s*["']?\s*https?:|url\(\s*["']?\s*https?:|@import)/i;

/** Whether the mail loads images or styles from the internet (tracking pixels included). */
export function hasRemoteContent(html: string): boolean {
  return remotePattern.test(html);
}
