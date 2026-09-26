"use client";
import { useFormatter, useTranslations } from "next-intl";
import { useDocumentWorkspace } from "./document-workspace";
import { useSaveStatus } from "./wiki-editor/use-save-status";

const ERROR_REASONS = new Set(["tooLarge", "invalid"]);

/** The page's only visible save indicator; its title shows the last save time. */
export function DocumentSaveStatus() {
  const t = useTranslations("wiki");
  const tCollaboration = useTranslations("collaboration");
  const format = useFormatter();
  const { collaboration } = useDocumentWorkspace();
  const { state, reason, savedAt, recoveryAvailable } = useSaveStatus(collaboration);
  const label = state === "saved" ? t("saved")
    : state === "saving" ? t("saving")
    : state === "unsaved" ? t("editor.save.unsaved")
    : state === "connecting" ? tCollaboration("connecting")
    : state === "offline" ? t(recoveryAvailable ? "editor.save.offline" : "editor.save.offlineUnsaved")
    : reason === "denied" ? tCollaboration("denied")
    : reason && ERROR_REASONS.has(reason) ? tCollaboration(`errorReasons.${reason}`)
    : t("editor.save.error");
  const title = savedAt ? t("editor.save.lastSaved", { time: format.dateTime(new Date(savedAt), { timeStyle: "medium" }) }) : t("editor.save.notSavedYet");
  const problem = state === "error" || state === "offline" || state === "unsaved";
  return <span data-testid="document-save-status" data-state={state} role={state === "error" ? "alert" : "status"} title={title}
    className={`mr-2 max-w-md text-xs ${problem ? "text-destructive" : "text-muted-foreground"}`}>{label}</span>;
}
