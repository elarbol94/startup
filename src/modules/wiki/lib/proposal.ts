import type { TiptapNode } from "./tiptap";

function text(value: string): TiptapNode[] {
  return value ? [{ type: "text", text: value }] : [];
}

function cell(value: string, header = false): TiptapNode {
  return {
    type: header ? "markdownTableHeader" : "markdownTableCell",
    attrs: { alignment: header ? "left" : "left", widthPercent: null },
    content: [{ type: "paragraph", content: text(value) }],
  };
}

export function proposalTable(
  kind: "generic" | "budget" | "workPackages" | "timeline" | "risks" | "kpis" | "team",
  rows?: string[][],
): TiptapNode {
  const presets: Record<typeof kind, string[][]> = {
    generic: [["Column 1", "Column 2", "Column 3"], ["", "", ""]],
    budget: [["Cost item", "Work package", "Quantity", "Unit price", "Total", "Eligible"], ["Personnel", "WP1", "1", "€ 0.00", "€ 0.00", "€ 0.00"]],
    workPackages: [["WP", "Objective", "Activities", "Lead", "Deliverable", "Period"], ["WP1", "", "", "", "", "M1–M3"]],
    timeline: [["Milestone", "Owner", "Due", "Evidence"], ["M1", "", "", ""]],
    risks: [["Risk", "Likelihood", "Impact", "Mitigation", "Owner"], ["", "Medium", "Medium", "", ""]],
    kpis: [["KPI", "Baseline", "Target", "Measurement", "Due"], ["", "", "", "", ""]],
    team: [["Name", "Role", "Responsibility"], ["", "", ""]],
  };
  const values = rows?.length ? rows : presets[kind];
  return {
    type: "markdownTable",
    attrs: { tableId: `${kind}-${crypto.randomUUID()}`, caption: "", includeInTableIndex: true },
    content: values.map((row, rowIndex) => ({
      type: "markdownTableRow",
      content: row.map((value) => cell(value, rowIndex === 0)),
    })),
  };
}

export function proposalSectionSnippet(kind: "executiveSummary" | "objectives" | "deliverables" | "assumptions" | "decision"): TiptapNode[] {
  const snippets: Record<typeof kind, [string, string]> = {
    executiveSummary: ["Executive summary", "Summarise the need, proposed solution, expected impact, budget, and decision required."],
    objectives: ["Objectives and outcomes", "Define measurable objectives, target groups, indicators, and the intended long-term outcome."],
    deliverables: ["Deliverables and milestones", "List each deliverable, its owner, acceptance evidence, and due date."],
    assumptions: ["Assumptions and exclusions", "State the assumptions, dependencies, constraints, and work explicitly outside the scope."],
    decision: ["Decision requested", "State the exact approval or commitment required, by whom, and by when."],
  };
  const [heading, guidance] = snippets[kind];
  return [
    { type: "heading", attrs: { level: 1, id: kind + "-" + crypto.randomUUID() }, content: text(heading) },
    { type: "paragraph", content: text(guidance) },
  ];
}
