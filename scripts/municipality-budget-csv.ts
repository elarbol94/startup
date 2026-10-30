/** Parsers for the offenerhaushalt.at Rechnungsabschluss CSVs, shared by the import scripts. */
export function parseSemicolonCsv(source: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ";") { row.push(field); field = ""; }
    else if (character === "\n") {
      row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = []; field = "";
    } else field += character;
  }
  if (quoted) throw new Error("Nicht geschlossenes Anführungszeichen in CSV-Datei.");
  if (field.length || row.length) {
    row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
    if (row.some((value) => value.length > 0)) rows.push(row);
  }
  return rows;
}

export function parseEuroCents(value: string) {
  const normalized = value.trim().replaceAll(" ", "").replaceAll(".", "");
  const match = /^([+-]?)(\d+)(?:,(\d{1,2}))?$/.exec(normalized);
  if (!match) throw new Error(`Ungültiger Eurobetrag: ${value}`);
  const cents = Number(match[2]) * 100 + Number((match[3] ?? "").padEnd(2, "0"));
  const signed = match[1] === "-" ? -cents : cents;
  if (!Number.isSafeInteger(signed)) throw new Error(`Eurobetrag außerhalb des sicheren Bereichs: ${value}`);
  return signed;
}
