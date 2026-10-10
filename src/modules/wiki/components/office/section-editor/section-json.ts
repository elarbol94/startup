/**
 * The section travels between the two editors as ONLYOFFICE Document Builder
 * JSON (`ToJSON`/`Api.FromJSON`, with the used styles and numberings). These
 * helpers only reshape and inspect that JSON; the editors do the conversion.
 */
type JsonObject = Record<string, unknown>;

function parseObject(json: string): JsonObject {
  const value: unknown = JSON.parse(json);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid section json");
  return value as JsonObject;
}

/** Visits every object in the tree (iteratively: documents can nest deeply). */
function someObject(root: unknown, predicate: (value: JsonObject) => boolean) {
  const stack: unknown[] = [root];
  while (stack.length) {
    const value = stack.pop();
    if (!value || typeof value !== "object") continue;
    if (Array.isArray(value)) { for (const item of value) stack.push(item); continue; }
    if (predicate(value as JsonObject)) return true;
    for (const item of Object.values(value)) if (item && typeof item === "object") stack.push(item);
  }
  return false;
}

/**
 * Turns the locked wrapper (`blockLvlSdt` JSON from the main document) into a
 * document body for the section editor: the wrapper's content with its styles
 * and numberings, without the wrapper itself.
 */
export function sectionDocumentJson(wrapperJson: string) {
  const wrapper = parseObject(wrapperJson);
  const content = (wrapper.sdtContent as JsonObject | undefined)?.content;
  if (wrapper.type !== "blockLvlSdt" || !Array.isArray(content)) throw new Error("invalid section json");
  return JSON.stringify({ type: "document", content, styles: wrapper.styles, numbering: wrapper.numbering });
}

/** Whether the section contains comments (they are recreated and may lose replies). */
export function containsComments(json: string) {
  return someObject(parseObject(json), (value) => value.type === "commentRangeStart");
}

/** Whether the section contains citations (the main document then refreshes its bibliography). */
export function containsCitations(json: string) {
  return someObject(parseObject(json), (value) => {
    const tag = (value.sdtPr as JsonObject | undefined)?.tag;
    return typeof tag === "string" && tag.startsWith("mp:cite:");
  });
}
