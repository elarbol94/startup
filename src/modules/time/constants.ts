// Plain constants shared by the schema and client components (no DB imports).
export const timeEntryKinds = ["work", "travel", "training", "internal"] as const;
export type TimeEntryKind = (typeof timeEntryKinds)[number];

export const timeEntrySources = ["timer", "manual"] as const;
export type TimeEntrySource = (typeof timeEntrySources)[number];
