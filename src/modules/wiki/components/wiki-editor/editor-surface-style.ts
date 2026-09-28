// Typography and zoom custom properties of the wiki editor surface. Used by wiki-editor.tsx.
import type { CSSProperties } from "react";
import { wikiTypographyCssVariables, type WikiTypographySettingsV1 } from "../../lib/wiki-typography";

export function editorTypographyStyle(typography: WikiTypographySettingsV1, documentZoom: number) {
  return {
    ...wikiTypographyCssVariables(typography),
    zoom: documentZoom / 100,
  } as CSSProperties;
}
