// Editing a municipality analysis graph: applying a batch of operations to it, node sizes, and the
// identity of a dataset reference. Used through analysis.ts.
import {
  DEFAULT_ANALYSIS_NODE_HEIGHT,
  DEFAULT_ANALYSIS_NODE_WIDTH,
  DEFAULT_ANALYSIS_NOTE_HEIGHT,
  DEFAULT_ANALYSIS_NOTE_WIDTH,
  MAX_ANALYSIS_NODE_HEIGHT,
  MAX_ANALYSIS_NODE_WIDTH,
  MAX_ANALYSIS_SHIFT_YEARS,
  MIN_ANALYSIS_NODE_HEIGHT,
  MIN_ANALYSIS_NODE_WIDTH,
  MIN_ANALYSIS_NOTE_HEIGHT,
  MIN_ANALYSIS_NOTE_WIDTH,
  municipalityAnalysisGraphOperationsSchema,
  municipalityAnalysisGraphSchema,
  type MunicipalityAnalysisGraph,
  type MunicipalityAnalysisGraphOperation,
  type MunicipalityAnalysisNode,
  type MunicipalityDatasetRef,
} from "./analysis-schema";

export function analysisNodeWidth(node: MunicipalityAnalysisNode) {
  return node.width ?? (node.type === "annotation" ? DEFAULT_ANALYSIS_NOTE_WIDTH : DEFAULT_ANALYSIS_NODE_WIDTH);
}

export function analysisNodeHeight(node: MunicipalityAnalysisNode) {
  return node.height ?? (node.type === "annotation" ? DEFAULT_ANALYSIS_NOTE_HEIGHT : DEFAULT_ANALYSIS_NODE_HEIGHT);
}

function clampAnalysisNodeSize(node: MunicipalityAnalysisNode, width: number, height: number) {
  const minWidth = node.type === "annotation" ? MIN_ANALYSIS_NOTE_WIDTH : MIN_ANALYSIS_NODE_WIDTH;
  const minHeight = node.type === "annotation" ? MIN_ANALYSIS_NOTE_HEIGHT : MIN_ANALYSIS_NODE_HEIGHT;
  return {
    width: Math.min(MAX_ANALYSIS_NODE_WIDTH, Math.max(minWidth, Math.round(width))),
    height: Math.min(MAX_ANALYSIS_NODE_HEIGHT, Math.max(minHeight, Math.round(height))),
  };
}

/**
 * Checks a graph the reducer just built and hands back the very same object.
 *
 * Zod rebuilds every node and edge it validates, so returning its output would give each
 * untouched node a new identity — and selecting a node or panning the canvas would then
 * re-render every card on it. The reducer only ever assembles already-validated pieces,
 * so the parse is here for the invariants (unique ids, no cycles, edge targets), not to
 * coerce anything.
 */
function validateAnalysisGraph(graph: MunicipalityAnalysisGraph) {
  municipalityAnalysisGraphSchema.parse(graph);
  return graph;
}

// Key order is not part of a dataset's identity: the same reference built by the map and
// by a Kennzahl derivation lists its fields in a different order, and comparing the raw
// JSON would treat them as two different datasets.
export const datasetRefKey = (dataset: MunicipalityDatasetRef) =>
  JSON.stringify(Object.entries(dataset).sort(([left], [right]) => left.localeCompare(right)));

/** Constants carry no municipality, so every caller reading the name goes through here. */
export const datasetMunicipalityName = (dataset: MunicipalityDatasetRef) =>
  "municipalityName" in dataset ? dataset.municipalityName : null;

export function addDatasetToGraph(graph: MunicipalityAnalysisGraph, dataset: MunicipalityDatasetRef, id: string) {
  // The same operation can arrive twice — a retry after a failed save, or the client
  // replaying what it has not seen confirmed yet. Matching on the id first keeps that a
  // no-op even once the node's dataset has been edited and no longer matches by value.
  if (graph.nodes.some((node) => node.id === id)) {
    return { graph: { ...graph, selectedNodeId: id }, nodeId: id, duplicate: true };
  }
  const existing = graph.nodes.find((node) => node.type === "dataset" && datasetRefKey(node.data.dataset) === datasetRefKey(dataset));
  if (existing) return { graph: { ...graph, selectedNodeId: existing.id }, nodeId: existing.id, duplicate: true };
  const index = graph.nodes.length;
  const node: MunicipalityAnalysisNode = {
    id, type: "dataset", position: { x: 80 + (index % 3) * 270, y: 80 + Math.floor(index / 3) * 190 }, data: { dataset },
  };
  const next = { ...graph, nodes: [...graph.nodes, node], selectedNodeId: id };
  return { graph: validateAnalysisGraph(next), nodeId: id, duplicate: false };
}

/**
 * Expands a Kennzahl into the operations that draw its derivation.
 *
 * Injected rather than imported so this module stays free of the Kennzahl registry —
 * `kennzahlen.ts` builds on the graph types defined here, and importing it back would
 * close the loop.
 */
export type KennzahlExpander = (
  dataset: MunicipalityDatasetRef,
  graph: MunicipalityAnalysisGraph,
) => MunicipalityAnalysisGraphOperation[] | null;

export function applyMunicipalityAnalysisGraphOperations(
  graph: MunicipalityAnalysisGraph,
  operations: MunicipalityAnalysisGraphOperation[],
  expandKennzahl?: KennzahlExpander,
) {
  const parsedOperations = municipalityAnalysisGraphOperationsSchema.parse(operations);
  let next = graph;
  let duplicateCount = 0;
  let lastDatasetNodeId: string | null = null;
  for (const operation of parsedOperations) {
    if (operation.type === "add-kennzahl") {
      const previousIds = new Set(next.nodes.map(node => node.id));
      const expanded = expandKennzahl?.(operation.dataset, next);
      // An empty array means the derivation is already fully on the canvas — that is a
      // successful no-op, not a missing derivation.
      if (expanded) {
        if (expanded.length) next = applyMunicipalityAnalysisGraphOperations(next, expanded, expandKennzahl).graph;
      } else {
        // No derivation (an Ausgangsdatum, or a primary calculation): one node, as before.
        const added = addDatasetToGraph(next, operation.dataset, operation.nodeId);
        next = added.graph;
        lastDatasetNodeId = added.nodeId;
        if (added.duplicate) duplicateCount += 1;
      }
      if (operation.position) {
        const inserted = next.nodes.filter(node => !previousIds.has(node.id));
        if (inserted.length) {
          const x = Math.min(...inserted.map(node => node.position.x));
          const y = Math.min(...inserted.map(node => node.position.y));
          const origin = operation.position;
          next = { ...next, nodes: next.nodes.map(node => previousIds.has(node.id) ? node : { ...node, position: { x: origin.x + node.position.x - x, y: origin.y + node.position.y - y } }) };
        }
      }
    } else if (operation.type === "add-dataset") {
      const added = addDatasetToGraph(next, operation.dataset, operation.nodeId);
      next = added.graph;
      lastDatasetNodeId = added.nodeId;
      if (added.duplicate) duplicateCount += 1;
    } else if (operation.type === "add-node") {
      if (!next.nodes.some(({ id }) => id === operation.node.id)) {
        next = { ...next, nodes: [...next.nodes, operation.node], selectedNodeId: operation.node.id };
      }
    } else if (operation.type === "update-condition") {
      next = { ...next, nodes: next.nodes.map(node => node.id === operation.nodeId && node.type === "dataset" && node.data.dataset.kind === "condition" ? { ...node, data: { ...node.data, dataset: { ...node.data.dataset, condition: operation.condition } } } : node) };
    } else if (operation.type === "remove-node") {
      next = {
        ...next,
        nodes: next.nodes.filter(({ id }) => id !== operation.nodeId),
        edges: next.edges.filter(({ source, target }) => source !== operation.nodeId && target !== operation.nodeId),
        selectedNodeId: next.selectedNodeId === operation.nodeId ? null : next.selectedNodeId,
      };
    } else if (operation.type === "move-node") {
      next = { ...next, nodes: next.nodes.map((node) => node.id === operation.nodeId ? { ...node, position: operation.position } : node) };
    } else if (operation.type === "add-edge") {
      const edges = next.edges.filter((edge) => edge.id !== operation.edge.id && !(edge.target === operation.edge.target && edge.targetHandle === operation.edge.targetHandle));
      next = { ...next, edges: [...edges, operation.edge], selectedNodeId: operation.edge.target };
    } else if (operation.type === "remove-edge") {
      next = { ...next, edges: next.edges.filter(({ id }) => id !== operation.edgeId) };
    } else if (operation.type === "set-viewport") {
      next = { ...next, viewport: operation.viewport };
    } else if (operation.type === "set-subject") {
      next = { ...next, subject: operation.subject };
    } else if (operation.type === "set-node-value") {
      next = {
        ...next,
        nodes: next.nodes.map((node) => {
          if (node.id !== operation.nodeId) return node;
          // Clamped rather than validated: a typed-in 0 or 99 should settle on the nearest
          // usable value instead of throwing away the whole operation batch.
          if (node.type === "operator") {
            const years = Math.min(MAX_ANALYSIS_SHIFT_YEARS, Math.max(1, Math.round(operation.value)));
            return { ...node, data: { ...node.data, years } };
          }
          if (node.type !== "dataset") return node;
          return node.data.dataset.kind === "constant"
            ? { ...node, data: { ...node.data, dataset: { kind: "constant" as const, value: operation.value } } }
            : node;
        }),
      };
    } else if (operation.type === "set-node-title") {
      next = {
        ...next,
        nodes: next.nodes.map((node) => {
          if (node.id !== operation.nodeId || node.type === "annotation") return node;
          if (node.type === "dataset") return { ...node, data: { ...node.data, alias: operation.title } };
          return { ...node, data: { ...node.data, alias: operation.title } };
        }),
      };
    } else if (operation.type === "resize-node") {
      next = {
        ...next,
        nodes: next.nodes.map((node) => node.id === operation.nodeId
          ? { ...node, position: operation.position, ...clampAnalysisNodeSize(node, operation.width, operation.height) }
          : node),
      };
    } else if (operation.type === "set-annotation") {
      next = {
        ...next,
        nodes: next.nodes.map((node) => node.id === operation.nodeId && node.type === "annotation"
          ? { ...node, data: { text: operation.text, color: operation.color } }
          : node),
      };
    } else if (operation.type === "set-node-municipality") {
      next = {
        ...next,
        nodes: next.nodes.map((node) => {
          if (node.id !== operation.nodeId || node.type !== "dataset") return node;
          const { dataset } = node.data;
          // A constant is the same number everywhere, so it has no municipality to set.
          if (dataset.kind === "constant") return node;
          const open = Object.fromEntries(
            Object.entries(dataset).filter(([key]) => key !== "municipalityCode" && key !== "municipalityName"),
          );
          return {
            ...node,
            data: { ...node.data, dataset: (operation.municipality ? { ...open, ...operation.municipality } : open) as MunicipalityDatasetRef },
          };
        }),
      };
    } else {
      next = {
        ...next,
        selectedNodeId: operation.nodeId && next.nodes.some(({ id }) => id === operation.nodeId) ? operation.nodeId : null,
      };
    }
  }
  // Once for the batch rather than once per operation: the check parses the whole graph,
  // and an auto-layout of a large graph is one move operation per node. What it guards —
  // the node and edge ceilings, finite positions — is a property of where the batch ends
  // up, so checking every intermediate step only made tidying up quadratic.
  return { graph: validateAnalysisGraph(next), duplicateCount, lastDatasetNodeId };
}
