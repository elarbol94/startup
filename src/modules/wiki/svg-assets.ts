import "server-only";

import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { wikiPages, wikiSvgAssets } from "@/db/schema";
import { isSafeInlineSvg } from "@/lib/svg-upload";
import { parseDocumentSettings } from "./lib/document-settings";
import { applyDocumentTypography, type SvgDocument, type SvgElement } from "./lib/svg-typography";
import { getWikiTypographyForUser } from "./lib/wiki-typography.server";
import { isEditableSvgText, parseSvgBindings, setOwnSvgText } from "./lib/svg-text";

/**
 * Renders a stored SVG graphic of an old-editor page with its text bindings and
 * document typography. Used by the Word conversion and the read-only HTML view.
 */
export function renderSvgAsset(assetId: string, options: { raw?: boolean } = {}) {
  const row = db.select({
    currentSvg: wikiSvgAssets.currentSvg,
    bindingsJson: wikiSvgAssets.bindingsJson,
    pageTitle: wikiPages.title,
    settingsJson: wikiPages.documentSettingsJson,
    pageOwner: wikiPages.createdBy,
    version: wikiSvgAssets.version,
    sizeScale: wikiSvgAssets.sizeScale,
  }).from(wikiSvgAssets)
    .innerJoin(wikiPages, eq(wikiSvgAssets.pageId, wikiPages.id))
    .where(eq(wikiSvgAssets.id, assetId))
    .get();
  if (!row) return null;
  if (options.raw) return { svg: row.currentSvg, version: row.version };
  const bindings = parseSvgBindings(row.bindingsJson);
  const settings = parseDocumentSettings(row.settingsJson);
  const matchesTypography = settings.diagrams.matchFont || settings.diagrams.matchColor || settings.diagrams.sizeMode !== "off";
  if (!Object.keys(bindings).length && !matchesTypography) return { svg: row.currentSvg, version: row.version };
  const variables: Record<string, string> = { title: row.pageTitle, author: settings.metadata.author, ...settings.variables };
  const document = new DOMParser().parseFromString(row.currentSvg, "image/svg+xml");
  const elements = [
    ...Array.from(document.getElementsByTagName("text")),
    ...Array.from(document.getElementsByTagName("tspan")),
  ];
  for (const [id, key] of Object.entries(bindings)) {
    const element = elements.find((candidate) => candidate.getAttribute("data-wiki-text-id") === id);
    if (!element || !isEditableSvgText(element)) continue;
    setOwnSvgText(element, variables[key] ?? "");
  }
  // Cast at the boundary: the xmldom node types differ from the DOM lib ones,
  // and only the two accessors in SvgElement are used.
  if (matchesTypography) {
    applyDocumentTypography(
      document as unknown as SvgDocument,
      elements as unknown as SvgElement[],
      settings,
      row.sizeScale,
      getWikiTypographyForUser(row.pageOwner),
    );
  }
  const svg = new XMLSerializer().serializeToString(document);
  if (!isSafeInlineSvg(new TextEncoder().encode(svg))) throw new Error("Unsafe SVG result");
  return { svg, version: row.version };
}
