// Report kinds share one dialog, table and number sequence. The three free-text
// fields keep their original names (happened/steps/expected); each kind only
// relabels them, so older reports and retries stay compatible.
export const REPORT_KINDS = ["bug", "feature", "improvement", "other"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const REPORT_PREFIX: Record<ReportKind, string> = { bug: "BUG", feature: "FEAT", improvement: "IMPR", other: "FB" };
export const reportReference = (kind: ReportKind, number: number) => `${REPORT_PREFIX[kind]}-${number}`;

/** Kinds without the two optional detail fields. */
export const hasDetails = (kind: ReportKind) => kind !== "other";

// Section headings written into the task description (server side, reporter's locale).
export const DESCRIPTION_LABELS: Record<"de" | "en", Record<ReportKind, [string, string, string]>> = {
  de: {
    bug: ["Was ist passiert?", "Schritte zum Reproduzieren", "Erwartetes Verhalten"],
    feature: ["Gewünschte Funktion", "Wofür wird sie gebraucht?", "Wie könnte sie funktionieren?"],
    improvement: ["Was soll besser werden?", "Wie ist es heute?", "Vorschlag"],
    other: ["Nachricht", "", ""],
  },
  en: {
    bug: ["What happened?", "Steps to reproduce", "Expected behavior"],
    feature: ["Requested feature", "What is it needed for?", "How could it work?"],
    improvement: ["What should be improved?", "How does it work today?", "Suggestion"],
    other: ["Message", "", ""],
  },
};
