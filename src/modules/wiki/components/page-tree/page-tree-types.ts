import type { WorkspacePage } from "../../research-queries";

export type Row = WorkspacePage & { depth: number };
export const pageStatuses = ["inbox", "working", "evergreen"] as const;
export type PageStatus = (typeof pageStatuses)[number];
export const INDENT = 20;
