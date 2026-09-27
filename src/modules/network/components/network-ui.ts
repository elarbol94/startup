// Small presentation helpers shared by the network components.

export const selectClassName =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

/** "2026-09-27" → a Date at noon UTC, so formatting never shifts the calendar day. */
export function dateOnly(value: string) {
  return new Date(`${value}T12:00:00Z`);
}
