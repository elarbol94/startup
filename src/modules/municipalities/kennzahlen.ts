// Ausgangsdaten and Kennzahlen (see docs/municipality-kennzahlen.md). The expression vocabulary and
// built-in derivations live in kennzahlen-expression.ts, the per-Datenart view lists in
// kennzahlen-datenart.ts, the graph round trip in kennzahlen-graph.ts, map-wide evaluation in
// kennzahlen-lookup.ts and the stored form in kennzahlen-persistence.ts; importers read everything from here.
export * from "./kennzahlen-expression";
export * from "./kennzahlen-datenart";
export * from "./kennzahlen-graph";
export * from "./kennzahlen-lookup";
export * from "./kennzahlen-persistence";
export { createPeerMedianIndex } from "./peer-medians";

// --- browsable catalogue ----------------------------------------------------

export { KENNZAHL_CATALOG } from "./metric-catalog";
