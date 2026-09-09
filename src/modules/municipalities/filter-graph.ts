import { emptyMunicipalityAnalysisGraph, type MunicipalityAnalysisGraph } from "./analysis";
import { municipalityFilterSchema, type MunicipalityFilter } from "./filters";
/** De Morgan preserves three-valued logic, including unknown under NOT. */
export function filterToAnalysisGraph(input: MunicipalityFilter): MunicipalityAnalysisGraph {
  const filter = municipalityFilterSchema.parse(input);
  const graph = emptyMunicipalityAnalysisGraph();
  let nextId = 0;
  function combine(ids: string[], operator: "and" | "or") {
    return ids.slice(1).reduce((a, b) => {
      const id = `filter-${nextId++}`;
      graph.nodes.push({ id, type: "operator", position: { x: 440, y: nextId * 120 }, data: { operator } });
      graph.edges.push({ id: `${a}-${id}`, source: a, target: id, sourceHandle: "output", targetHandle: "a" }, { id: `${b}-${id}`, source: b, target: id, sourceHandle: "output", targetHandle: "b" });
      return id;
    }, ids[0]);
  }
  const groups = filter.groups.map(group => combine(group.conditions.map(condition => {
    const id = `filter-${nextId++}`;
    graph.nodes.push({ id, type: "dataset", position: { x: 40, y: nextId * 180 }, data: { dataset: { kind: "condition", condition: { ...condition, negate: group.negate ? !condition.negate : condition.negate } } } });
    return id;
  }), group.negate ? group.mode === "and" ? "or" : "and" : group.mode));
  graph.selectedNodeId = combine(groups, filter.mode);
  return graph;
}
