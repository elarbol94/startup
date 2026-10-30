// The stored shape of a municipality analysis graph: node, edge, dataset and operation schemas, their
// limits, and the serialised form. Used through analysis.ts.
import { conditionSchema } from "./filters";
import { z } from "zod";

export const ANALYSIS_GRAPH_VERSION = 2;
export const MAX_ANALYSIS_NODES = 100;
export const MAX_ANALYSIS_EDGES = 200;
export const MAX_ANALYSIS_JSON_BYTES = 250_000;

export const DEFAULT_ANALYSIS_NODE_WIDTH = 240;
export const DEFAULT_ANALYSIS_NODE_HEIGHT = 176;
export const MIN_ANALYSIS_NODE_WIDTH = 200;
export const MIN_ANALYSIS_NODE_HEIGHT = 140;
export const MAX_ANALYSIS_NODE_WIDTH = 640;
export const MAX_ANALYSIS_NODE_HEIGHT = 480;
export const DEFAULT_ANALYSIS_NOTE_WIDTH = 240;
export const DEFAULT_ANALYSIS_NOTE_HEIGHT = 160;
export const MIN_ANALYSIS_NOTE_WIDTH = 160;
export const MIN_ANALYSIS_NOTE_HEIGHT = 100;
export const analysisAnnotationColors = ["gray", "sand", "blue", "green"] as const;
export type AnalysisAnnotationColor = (typeof analysisAnnotationColors)[number];

export const analysisBinaryOperatorIds = [
  "add", "subtract", "multiply", "divide", "greater-than",
  "greater-or-equal", "less-than", "less-or-equal", "equal", "not-equal",
  "and", "or",
] as const;
/** Operators reading input A plus a number typed into the node, rather than a second input. */
export const analysisUnaryOperatorIds = ["shift"] as const;
export const analysisOperatorIds = [...analysisBinaryOperatorIds, ...analysisUnaryOperatorIds] as const;
export type AnalysisOperatorId = (typeof analysisOperatorIds)[number];
export type AnalysisBinaryOperatorId = (typeof analysisBinaryOperatorIds)[number];
export type AnalysisUnaryOperatorId = (typeof analysisUnaryOperatorIds)[number];
export const isUnaryAnalysisOperator = (operator: AnalysisOperatorId): operator is AnalysisUnaryOperatorId =>
  (analysisUnaryOperatorIds as readonly string[]).includes(operator);

export const ANALYSIS_OPERATOR_SYMBOLS: Record<AnalysisOperatorId, string> = {
  add: "+", subtract: "−", multiply: "×", divide: "÷", "greater-than": ">",
  "greater-or-equal": "≥", "less-than": "<", "less-or-equal": "≤", equal: "=",
  "not-equal": "≠", and: "∧", or: "∨", shift: "↺",
};

/** How many years a shift may reach back; also the default when the node carries none. */
export const MAX_ANALYSIS_SHIFT_YEARS = 20;
export const DEFAULT_ANALYSIS_SHIFT_YEARS = 1;

const positionSchema = z.object({ x: z.number().finite(), y: z.number().finite() });
export const analysisSubjectSchema = z.object({
  municipalityCode: z.string().regex(/^\d{5}$/),
  municipalityName: z.string().trim().min(1).max(160),
});
export type AnalysisSubject = z.infer<typeof analysisSubjectSchema>;
/**
 * A dataset node is either pinned to a municipality or left open, in which case it follows
 * the graph's subject. A Kennzahl is the same formula everywhere, so open is the normal
 * case; pinning is what makes comparing two municipalities in one graph possible.
 */
const pinnedMunicipality = {
  municipalityCode: z.string().regex(/^\d{5}$/).optional(),
  municipalityName: z.string().trim().min(1).max(160).optional(),
};

export const municipalityDatasetRefSchema = z.discriminatedUnion("kind", [
  // Lazy: a condition on an own Kennzahl embeds an expression, whose schema imports this file.
  z.object({ kind: z.literal("condition"), ...pinnedMunicipality, condition: z.lazy(() => conditionSchema) }),
  z.object({ kind: z.literal("population"), ...pinnedMunicipality, view: z.enum(["count", "density", "foreign-share", "foreign-persons", "structure-population"]) }),
  z.object({
    kind: z.literal("age-group"), ...pinnedMunicipality,
    ageGroup: z.enum(["0-5", "6-14", "15-24", "25-44", "45-64", "65-79", "80-plus", "total"]),
    measure: z.enum(["share", "persons"]), sex: z.enum(["all", "female", "male"]),
  }),
  z.object({
    kind: z.literal("age-indicator"), ...pinnedMunicipality,
    indicator: z.enum(["youth-share", "senior-share", "old-age-dependency", "child-dependency", "total-dependency", "aging-index", "average-age", "women-share", "women-per-100-men"]),
  }),
  z.object({
    kind: z.literal("movement"), ...pinnedMunicipality,
    metric: z.enum(["population-change", "births", "deaths", "birth-rate", "death-rate", "birth-balance-rate", "arrivals", "departures", "migration-balance-rate", "international-migration-balance", "international-migration-balance-rate", "internal-migration-balance", "internal-migration-balance-rate", "statistical-correction", "international-arrivals", "international-departures", "internal-arrivals", "internal-departures"]),
  }),
  z.object({
    kind: z.literal("cost-share"), ...pinnedMunicipality,
    category: z.enum(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "total"]),
    measure: z.enum(["absolute", "share", "per-capita", "real-per-capita", "peer-deviation"]).optional(),
  }),
  z.object({
    kind: z.literal("attribute"), ...pinnedMunicipality,
    field: z.literal("area"),
  }),
  // Dimensionless scalar. Rates and shares are only expressible from Ausgangsdaten with
  // one — Geburtenrate is births / population * 1000 — so it carries no municipality.
  z.object({ kind: z.literal("constant"), value: z.number().finite() }),
]);
export type MunicipalityDatasetRef = z.infer<typeof municipalityDatasetRefSchema>;

const analysisAliasSchema = z.string().trim().min(1).max(120).nullable().optional();
const analysisComputationalSize = {
  width: z.number().finite().min(MIN_ANALYSIS_NODE_WIDTH).max(MAX_ANALYSIS_NODE_WIDTH).optional(),
  height: z.number().finite().min(MIN_ANALYSIS_NODE_HEIGHT).max(MAX_ANALYSIS_NODE_HEIGHT).optional(),
};

export const analysisDatasetNodeSchema = z.object({
  id: z.string().min(1).max(100), type: z.literal("dataset"), position: positionSchema,
  ...analysisComputationalSize,
  data: z.object({ dataset: municipalityDatasetRefSchema, alias: analysisAliasSchema }),
});
export const analysisOperatorNodeSchema = z.object({
  id: z.string().min(1).max(100), type: z.literal("operator"), position: positionSchema,
  ...analysisComputationalSize,
  // Only the unary operators read `years`; older graphs carry none and take the default.
  data: z.object({
    operator: z.enum(analysisOperatorIds),
    years: z.number().int().min(1).max(MAX_ANALYSIS_SHIFT_YEARS).optional(),
    alias: analysisAliasSchema,
  }),
});
export const analysisAnnotationNodeSchema = z.object({
  id: z.string().min(1).max(100), type: z.literal("annotation"), position: positionSchema,
  width: z.number().finite().min(MIN_ANALYSIS_NOTE_WIDTH).max(MAX_ANALYSIS_NODE_WIDTH).optional(),
  height: z.number().finite().min(MIN_ANALYSIS_NOTE_HEIGHT).max(MAX_ANALYSIS_NODE_HEIGHT).optional(),
  data: z.object({
    text: z.string().max(2_000),
    color: z.enum(analysisAnnotationColors),
  }),
});
export const analysisNodeSchema = z.discriminatedUnion("type", [analysisDatasetNodeSchema, analysisOperatorNodeSchema, analysisAnnotationNodeSchema]);
export const analysisEdgeSchema = z.object({
  id: z.string().min(1).max(140), source: z.string().min(1).max(100), target: z.string().min(1).max(100),
  sourceHandle: z.literal("output").default("output"), targetHandle: z.enum(["a", "b"]),
});
const municipalityAnalysisGraphV2Schema = z.object({
  version: z.literal(ANALYSIS_GRAPH_VERSION),
  nodes: z.array(analysisNodeSchema).max(MAX_ANALYSIS_NODES),
  edges: z.array(analysisEdgeSchema).max(MAX_ANALYSIS_EDGES),
  viewport: z.object({ x: z.number().finite(), y: z.number().finite(), zoom: z.number().finite().min(0.1).max(4) }),
  selectedNodeId: z.string().max(100).nullable(),
  // Which municipality the open nodes are about. Defaulted so graphs stored before the
  // subject existed keep parsing — they are simply pinned throughout.
  subject: analysisSubjectSchema.nullable().default(null),
}).superRefine((graph, context) => {
  const nodeIds = new Set(graph.nodes.map(({ id }) => id));
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  if (nodeIds.size !== graph.nodes.length) context.addIssue({ code: "custom", message: "Node ids must be unique" });
  if (graph.selectedNodeId && !nodeIds.has(graph.selectedNodeId)) context.addIssue({ code: "custom", message: "Selected node must exist" });
  const inputIds = new Set<string>();
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) context.addIssue({ code: "custom", message: "Edges must reference existing nodes" });
    if (nodesById.get(edge.target)?.type !== "operator") context.addIssue({ code: "custom", message: "Edges can only target operators" });
    if (nodesById.get(edge.source)?.type === "annotation") context.addIssue({ code: "custom", message: "Annotations cannot be connected" });
    const inputId = `${edge.target}:${edge.targetHandle}`;
    if (inputIds.has(inputId)) context.addIssue({ code: "custom", message: "Each operator input accepts one edge" });
    inputIds.add(inputId);
  }
  if (graph.edges.some((edge) => wouldCreateAnalysisCycle(graph.edges, edge.source, edge.target))) {
    context.addIssue({ code: "custom", message: "Analysis graph must not contain cycles" });
  }
});
export const municipalityAnalysisGraphSchema = z.preprocess((input) => {
  if (input && typeof input === "object" && "version" in input && input.version === 1) {
    return { ...input, version: ANALYSIS_GRAPH_VERSION };
  }
  return input;
}, municipalityAnalysisGraphV2Schema);
export type MunicipalityAnalysisGraph = z.infer<typeof municipalityAnalysisGraphSchema>;
export type MunicipalityAnalysisNode = z.infer<typeof analysisNodeSchema>;
export type MunicipalityAnalysisEdge = z.infer<typeof analysisEdgeSchema>;

export const ANALYSIS_OPERATION_VERSION = 1;
export const municipalityAnalysisGraphOperationSchema = z.discriminatedUnion("type", [
  z.object({ version: z.literal(ANALYSIS_OPERATION_VERSION), type: z.literal("update-condition"), nodeId: z.string().min(1).max(100), condition: z.lazy(() => conditionSchema) }),
  z.object({ version: z.literal(ANALYSIS_OPERATION_VERSION), type: z.literal("add-node"), node: analysisNodeSchema }),
  z.object({ version: z.literal(ANALYSIS_OPERATION_VERSION), type: z.literal("remove-node"), nodeId: z.string().min(1).max(100) }),
  z.object({ version: z.literal(ANALYSIS_OPERATION_VERSION), type: z.literal("move-node"), nodeId: z.string().min(1).max(100), position: positionSchema }),
  z.object({ version: z.literal(ANALYSIS_OPERATION_VERSION), type: z.literal("add-edge"), edge: analysisEdgeSchema }),
  z.object({ version: z.literal(ANALYSIS_OPERATION_VERSION), type: z.literal("remove-edge"), edgeId: z.string().min(1).max(140) }),
  z.object({ version: z.literal(ANALYSIS_OPERATION_VERSION), type: z.literal("set-viewport"), viewport: municipalityAnalysisGraphV2Schema.shape.viewport }),
  z.object({ version: z.literal(ANALYSIS_OPERATION_VERSION), type: z.literal("set-selected-node"), nodeId: z.string().max(100).nullable() }),
  z.object({ version: z.literal(ANALYSIS_OPERATION_VERSION), type: z.literal("add-dataset"), nodeId: z.string().min(1).max(100), dataset: municipalityDatasetRefSchema }),
  // Like add-dataset, but for a Kennzahl: the graph decides how it lands, because only it
  // knows which Ausgangsdaten are already on the canvas and where there is room.
  z.object({ version: z.literal(ANALYSIS_OPERATION_VERSION), type: z.literal("add-kennzahl"), nodeId: z.string().min(1).max(100), dataset: municipalityDatasetRefSchema, position: positionSchema.optional() }),
  z.object({ version: z.literal(ANALYSIS_OPERATION_VERSION), type: z.literal("set-subject"), subject: analysisSubjectSchema.nullable() }),
  // The number typed into a node: a constant's value, or a unary operator's year count.
  z.object({ version: z.literal(ANALYSIS_OPERATION_VERSION), type: z.literal("set-node-value"), nodeId: z.string().min(1).max(100), value: z.number().finite() }),
  z.object({ version: z.literal(ANALYSIS_OPERATION_VERSION), type: z.literal("set-node-title"), nodeId: z.string().min(1).max(100), title: z.string().trim().min(1).max(120).nullable() }),
  z.object({
    version: z.literal(ANALYSIS_OPERATION_VERSION), type: z.literal("resize-node"), nodeId: z.string().min(1).max(100),
    position: positionSchema, width: z.number().finite().positive(), height: z.number().finite().positive(),
  }),
  z.object({
    version: z.literal(ANALYSIS_OPERATION_VERSION), type: z.literal("set-annotation"), nodeId: z.string().min(1).max(100),
    text: z.string().max(2_000), color: z.enum(analysisAnnotationColors),
  }),
  // Pins one dataset node to a municipality, or releases it so it follows the subject.
  z.object({ version: z.literal(ANALYSIS_OPERATION_VERSION), type: z.literal("set-node-municipality"), nodeId: z.string().min(1).max(100), municipality: analysisSubjectSchema.nullable() }),
]);
export const municipalityAnalysisGraphOperationsSchema = z.array(municipalityAnalysisGraphOperationSchema).min(1).max(200);
export type MunicipalityAnalysisGraphOperation = z.infer<typeof municipalityAnalysisGraphOperationSchema>;

export function emptyMunicipalityAnalysisGraph(): MunicipalityAnalysisGraph {
  return { version: ANALYSIS_GRAPH_VERSION, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, selectedNodeId: null, subject: null };
}

export function serializeMunicipalityAnalysisGraph(graph: MunicipalityAnalysisGraph) {
  const json = JSON.stringify(municipalityAnalysisGraphSchema.parse(graph));
  if (new TextEncoder().encode(json).byteLength > MAX_ANALYSIS_JSON_BYTES) throw new Error("Analysis graph is too large");
  return json;
}

export function parseMunicipalityAnalysisGraph(json: string) {
  if (new TextEncoder().encode(json).byteLength > MAX_ANALYSIS_JSON_BYTES) throw new Error("Analysis graph is too large");
  return municipalityAnalysisGraphSchema.parse(JSON.parse(json));
}

export function wouldCreateAnalysisCycle(edges: MunicipalityAnalysisEdge[], source: string, target: string) {
  if (source === target) return true;
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) adjacency.set(edge.source, [...(adjacency.get(edge.source) ?? []), edge.target]);
  const queue = [target];
  const seen = new Set<string>();
  while (queue.length) {
    const current = queue.shift()!;
    if (current === source) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    queue.push(...(adjacency.get(current) ?? []));
  }
  return false;
}
