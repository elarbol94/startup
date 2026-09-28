import { formatBibliography, formatInlineCitation, isNumericCitationStyle, type CitationSource, type CitationStyle } from "../lib/citations";
import { listCitationSources } from "../research-queries";

export type CitationItem = { ids: string[]; loc?: string };

/**
 * Formats the in-text label of every citation control (in document order) and
 * the bibliography, using the page's locale and style. Numeric styles number
 * sources by first appearance, like the TipTap editor.
 */
export function formatDocumentCitations(items: CitationItem[], locale: string, style: CitationStyle, sources: CitationSource[] = listCitationSources(locale, 5000, style)) {
  const byId = new Map(sources.map((source) => [source.id, source]));
  const order: string[] = [];
  for (const item of items) for (const id of item.ids) if (byId.has(id) && !order.includes(id)) order.push(id);
  const numeric = isNumericCitationStyle(style);
  const labels = items.map((item) => {
    const known = item.ids.filter((id) => byId.has(id));
    if (!known.length) return null;
    if (numeric) {
      const numbers = known.map((id) => order.indexOf(id) + 1);
      return `[${numbers.join(", ")}${item.loc ? `, p. ${item.loc}` : ""}]`;
    }
    return known.map((id, index) => formatInlineCitation(byId.get(id)!, index === known.length - 1 ? item.loc : undefined, locale, order.indexOf(id) + 1, style)).join("; ");
  });
  const bibliography = formatBibliography(order.map((id) => byId.get(id)!), locale, style).map((entry) => entry.text);
  return { labels, bibliography };
}

export function searchCitationSources(query: string, locale: string, style: CitationStyle, limit = 20) {
  const needle = query.trim().toLocaleLowerCase(locale);
  return listCitationSources(locale, 5000, style)
    .filter((source) => !needle || [source.title, source.containerTitle, source.issuedDate, ...source.contributors.map((person) => person.literal || `${person.given} ${person.family}`)]
      .join(" ").toLocaleLowerCase(locale).includes(needle))
    .slice(0, limit)
    .map((source) => ({ id: source.id, title: source.title, year: source.issuedDate.slice(0, 4), authors: source.contributors.map((person) => person.family || person.literal).filter(Boolean).join(", ") }));
}
