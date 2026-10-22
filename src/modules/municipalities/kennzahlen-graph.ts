// Between a Kennzahl and an analysis graph: laying a derivation out as nodes and edges, the operations
// that insert it, and reading a sub-graph back into a Kennzahl. Used through kennzahlen.ts.
import { createId } from "@paralleldrive/cuid2";
import {
  DEFAULT_ANALYSIS_SHIFT_YEARS,
  isUnaryAnalysisOperator,
  type AnalysisSubject,
  ANALYSIS_OPERATION_VERSION,
  datasetRefKey,
  type AnalysisOperatorId,
  type MunicipalityAnalysisEdge,
  type MunicipalityAnalysisGraphOperation,
  type MunicipalityAnalysisNode,
  type MunicipalityDatasetRef,
} from "./analysis";
import {
  bindKennzahlInput,
  datasetClass,
  kennzahlExpressionFor,
  unbindKennzahlInput,
  type KennzahlExpression,
} from "./kennzahlen-expression";

// --- graph construction -----------------------------------------------------

const expressionKey = (expression: KennzahlExpression): string =>
  "input" in expression ? `i:${JSON.stringify(expression.input)}`
    : "constant" in expression ? `c:${expression.constant}`
      : "b" in expression ? `o:${expression.op}(${expressionKey(expression.a)},${expressionKey(expression.b)})`
        : `u:${expression.op}:${expression.years}(${expressionKey(expression.a)})`;

/**
 * Lays the expression out as an analysis graph: inputs on the left, the result on the
 * right. Identical sub-expressions become one node feeding several edges, so a Kennzahl
 * that uses the same Ausgangsdatum twice does not show it twice.
 */
export function buildKennzahlGraph(
  expression: KennzahlExpression,
  /** Pins every input to this municipality; open nodes follow the graph's subject. */
  municipality: { municipalityCode?: string; municipalityName?: string } | null,
  origin: { x: number; y: number } = { x: 80, y: 80 },
  /** What is already on the canvas; matching parts wire in instead of being duplicated. */
  existing: { nodes: readonly MunicipalityAnalysisNode[]; edges: readonly MunicipalityAnalysisEdge[] } = { nodes: [], edges: [] },
) {
  const existingNodes = existing.nodes;
  const existingByDataset = new Map(
    existingNodes.flatMap((node) => node.type === "dataset" ? [[datasetRefKey(node.data.dataset), node.id] as const] : []),
  );
  // An operator already fed by exactly these two inputs is this sub-expression, so reuse
  // it. Without this an insert would not be idempotent, and the persistence queue may
  // deliver the same operation twice after a retry.
  const existingOperator = (operator: AnalysisOperatorId, a: string, b: string | null, years?: number) => {
    for (const node of existingNodes) {
      if (node.type !== "operator" || node.data.operator !== operator) continue;
      if (years !== undefined && (node.data.years ?? DEFAULT_ANALYSIS_SHIFT_YEARS) !== years) continue;
      const source = (handle: "a" | "b") =>
        existing.edges.find((edge) => edge.target === node.id && edge.targetHandle === handle)?.source;
      // A unary operator matches only a node whose B is free, so it never reuses half of
      // a binary one.
      if (source("a") === a && (b === null ? !source("b") : source("b") === b)) return node.id;
    }
    return null;
  };
  const depths = new Map<string, number>();
  const measure = (node: KennzahlExpression, depth: number) => {
    const key = expressionKey(node);
    depths.set(key, Math.max(depths.get(key) ?? 0, depth));
    if ("op" in node) {
      measure(node.a, depth + 1);
      if ("b" in node) measure(node.b, depth + 1);
    }
  };
  measure(expression, 0);
  const maximumDepth = Math.max(...depths.values());

  const nodes: MunicipalityAnalysisNode[] = [];
  const edges: MunicipalityAnalysisEdge[] = [];
  const idByKey = new Map<string, string>();
  const rowByColumn = new Map<number, number>();

  const place = (node: KennzahlExpression): string => {
    const key = expressionKey(node);
    const seen = idByKey.get(key);
    if (seen) return seen;

    if (!("op" in node)) {
      const dataset: MunicipalityDatasetRef = "constant" in node
        ? { kind: "constant", value: node.constant }
        : bindKennzahlInput(node.input, municipality?.municipalityCode, municipality?.municipalityName);
      const reused = existingByDataset.get(datasetRefKey(dataset));
      if (reused) {
        idByKey.set(key, reused);
        return reused;
      }
      const id = createId();
      idByKey.set(key, id);
      nodes.push({ id, type: "dataset", position: nextPosition(key), data: { dataset } });
      return id;
    }

    // Children first so their nodes exist before the edges reference them.
    const a = place(node.a);
    if (!("b" in node)) {
      const reusedUnary = existingOperator(node.op, a, null, node.years);
      if (reusedUnary) {
        idByKey.set(key, reusedUnary);
        return reusedUnary;
      }
      const unaryId = createId();
      idByKey.set(key, unaryId);
      nodes.push({ id: unaryId, type: "operator", position: nextPosition(key), data: { operator: node.op, years: node.years } });
      edges.push({ id: createId(), source: a, target: unaryId, sourceHandle: "output", targetHandle: "a" });
      return unaryId;
    }
    const b = place(node.b);
    const reusedOperator = existingOperator(node.op, a, b);
    if (reusedOperator) {
      idByKey.set(key, reusedOperator);
      return reusedOperator;
    }
    const id = createId();
    idByKey.set(key, id);
    nodes.push({ id, type: "operator", position: nextPosition(key), data: { operator: node.op } });
    edges.push({ id: createId(), source: a, target: id, sourceHandle: "output", targetHandle: "a" });
    edges.push({ id: createId(), source: b, target: id, sourceHandle: "output", targetHandle: "b" });
    return id;
  };

  function nextPosition(key: string) {
    const column = maximumDepth - depths.get(key)!;
    const row = rowByColumn.get(column) ?? 0;
    rowByColumn.set(column, row + 1);
    return { x: origin.x + column * 280, y: origin.y + row * 200 };
  }

  const rootId = place(expression);
  return { nodes, edges, rootId };
}

/** Places a new block clear of whatever the graph already holds. */
export function nextGraphOrigin(nodes: readonly MunicipalityAnalysisNode[]) {
  if (!nodes.length) return { x: 80, y: 80 };
  return { x: 80, y: Math.max(...nodes.map(({ position }) => position.y)) + 220 };
}

/**
 * The operations that add a Kennzahl's derivation to an analysis graph — or null when the
 * dataset is an Ausgangsdatum or a primary calculation, which go in as a single node.
 */
export function kennzahlDerivationOperations(
  dataset: MunicipalityDatasetRef,
  origin?: { x: number; y: number },
  existing: { nodes: readonly MunicipalityAnalysisNode[]; edges: readonly MunicipalityAnalysisEdge[] } = { nodes: [], edges: [] },
): MunicipalityAnalysisGraphOperation[] | null {
  if (dataset.kind === "constant") return null;
  const input = unbindKennzahlInput(dataset);
  if (!input || datasetClass(input) === "base") return null;
  const expression = kennzahlExpressionFor(input);
  if (!expression) return null;
  const { nodes, edges } = buildKennzahlGraph(expression, dataset, origin, existing);
  // Every node is added before any edge, so an edge never references a missing endpoint.
  return [
    ...nodes.map((node): MunicipalityAnalysisGraphOperation => ({ version: ANALYSIS_OPERATION_VERSION, type: "add-node", node })),
    ...edges.map((edge): MunicipalityAnalysisGraphOperation => ({ version: ANALYSIS_OPERATION_VERSION, type: "add-edge", edge })),
  ];
}

/** Ready-made expander for `applyMunicipalityAnalysisGraphOperations`. */
export const expandKennzahlIntoGraph = (
  dataset: MunicipalityDatasetRef,
  graph: { nodes: readonly MunicipalityAnalysisNode[]; edges: readonly MunicipalityAnalysisEdge[] },
) => kennzahlDerivationOperations(dataset, nextGraphOrigin(graph.nodes), graph);

// --- turning a saved graph back into a Kennzahl -----------------------------

export type KennzahlFromGraph =
  | { ok: true; expression: KennzahlExpression; municipality: AnalysisSubject | null }
  | { ok: false; reason: "missing-input" | "mixed-municipalities" | "no-municipality-input" };

/**
 * Reads the sub-graph feeding `nodeId` back into a Kennzahl definition.
 *
 * Open nodes are already the parameter and need no unbinding. Pinned nodes do, and that
 * only works if they all name the same municipality — a graph comparing Graz with Wien is
 * a comparison, not a Kennzahl, and is rejected rather than silently reinterpreted.
 */
export function kennzahlFromGraph(
  graph: { nodes: readonly MunicipalityAnalysisNode[]; edges: readonly MunicipalityAnalysisEdge[] },
  nodeId: string,
): KennzahlFromGraph {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const municipalities = new Map<string, string>();
  let inputCount = 0;
  let failure: KennzahlFromGraph | null = null;

  const walk = (id: string): KennzahlExpression | null => {
    const node = nodesById.get(id);
    if (!node) return null;
    if (node.type === "dataset") {
      const dataset = node.data.dataset;
      if (dataset.kind === "constant") return { constant: dataset.value };
      inputCount += 1;
      if (dataset.municipalityCode) {
        municipalities.set(dataset.municipalityCode, dataset.municipalityName ?? dataset.municipalityCode);
      }
      return { input: unbindKennzahlInput(dataset)! };
    }
    if (node.type !== "operator") return null;
    const side = (handle: "a" | "b") => {
      const edge = graph.edges.find((item) => item.target === id && item.targetHandle === handle);
      return edge ? walk(edge.source) : null;
    };
    const operator = node.data.operator;
    if (isUnaryAnalysisOperator(operator)) {
      const a = side("a");
      if (!a) {
        failure ??= { ok: false, reason: "missing-input" };
        return null;
      }
      return { op: operator, a, years: node.data.years ?? DEFAULT_ANALYSIS_SHIFT_YEARS };
    }
    const a = side("a");
    const b = side("b");
    if (!a || !b) {
      failure ??= { ok: false, reason: "missing-input" };
      return null;
    }
    return { op: operator, a, b };
  };

  const expression = walk(nodeId);
  if (!expression) return failure ?? { ok: false, reason: "missing-input" };
  if (municipalities.size > 1) return { ok: false, reason: "mixed-municipalities" };
  // Constants alone are not a Kennzahl — it has to read something.
  if (!inputCount) return { ok: false, reason: "no-municipality-input" };
  const [municipalityCode, municipalityName] = municipalities.entries().next().value ?? [];
  return {
    ok: true,
    expression,
    municipality: municipalityCode ? { municipalityCode, municipalityName: municipalityName ?? municipalityCode } : null,
  };
}
