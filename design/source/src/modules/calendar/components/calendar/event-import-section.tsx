"use client";

// "Import from file or link" section of the event dialog: analyzes a file/URL and fills empty draft fields.
// Used by calendar-client.tsx (rendered inside event-dialog.tsx).
import { type RefObject } from "react";
import { useTranslations } from "next-intl";
import { Check, FileUp, Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  analyzeCalendarText,
  analyzeCalendarUrl,
} from "../../import-actions";
import {
  normalizeCalendarUrl,
  type CalendarImportSuggestion,
} from "../../import-parser";
import { addDays } from "../../date-utils";
import { cn } from "@/lib/utils";
import type { EventDraft, ImportableDraftField, ImportResult } from "./calendar-types";
import { extractImportFileText } from "./import-file-text";

export function EventImportSection({
  draft,
  setDraft,
  manuallyEditedFields,
  importFileInput,
  importUrl,
  setImportUrl,
  importBusy,
  setImportBusy,
  importError,
  setImportError,
  importResult,
  setImportResult,
  t,
}: {
  draft: EventDraft;
  setDraft: (draft: EventDraft) => void;
  manuallyEditedFields: Set<ImportableDraftField>;
  importFileInput: RefObject<HTMLInputElement | null>;
  importUrl: string;
  setImportUrl: (url: string) => void;
  importBusy: boolean;
  setImportBusy: (busy: boolean) => void;
  importError: string;
  setImportError: (error: string) => void;
  importResult: ImportResult | null;
  setImportResult: (result: ImportResult | null) => void;
  t: ReturnType<typeof useTranslations<"calendar">>;
}) {
  function applyImportSuggestion(
    suggestion: CalendarImportSuggestion,
    label: string,
  ) {
    const next = { ...draft };
    const fields: string[] = [];
    if (
      suggestion.title &&
      !manuallyEditedFields.has("title") &&
      !next.title.trim()
    ) {
      next.title = suggestion.title;
      fields.push("title");
    }
    if (
      suggestion.location &&
      !manuallyEditedFields.has("location") &&
      !next.location.trim()
    ) {
      next.location = suggestion.location;
      fields.push("location");
    }
    if (
      suggestion.address &&
      !manuallyEditedFields.has("address") &&
      !next.address.trim()
    ) {
      next.address = suggestion.address;
      fields.push("address");
    }
    if (
      suggestion.description &&
      !manuallyEditedFields.has("description") &&
      !next.description.trim()
    ) {
      next.description = suggestion.description;
      fields.push("description");
    }
    if (suggestion.startDate && !manuallyEditedFields.has("startDate")) {
      next.startDate = suggestion.startDate;
      fields.push("date");
    }
    if (suggestion.allDay !== undefined && !manuallyEditedFields.has("allDay")) {
      next.allDay = suggestion.allDay;
    }
    if (suggestion.startTime && !manuallyEditedFields.has("startTime")) {
      next.startTime = suggestion.startTime;
      fields.push("startTime");
    }
    if (suggestion.endTime && !manuallyEditedFields.has("endTime")) {
      next.endTime = suggestion.endTime;
      fields.push("endTime");
    }
    if (
      suggestion.endDate &&
      !manuallyEditedFields.has("endDate")
    ) {
      next.endDate = suggestion.endDate;
      fields.push("endDate");
    } else if (
      suggestion.startDate &&
      !manuallyEditedFields.has("endDate")
    ) {
      next.endDate = addDays(suggestion.startDate, next.allDay || next.endTime <= next.startTime ? 1 : 0);
    }
    if (suggestion.timezone && !manuallyEditedFields.has("timezone")) {
      next.timezone = suggestion.timezone;
      fields.push("timezone");
    }
    if (
      suggestion.repeat &&
      suggestion.repeat !== "none" &&
      !manuallyEditedFields.has("repeat")
    ) {
      next.repeat = suggestion.repeat;
      fields.push("repeat");
    }
    setDraft(next);
    setImportError("");
    setImportResult({
      label,
      fields: [...new Set(fields)],
      method: suggestion.analysisMethod ?? "parser",
    });
  }

  function importErrorMessage(error: unknown) {
    const message = error instanceof Error ? error.message : "";
    if (message === "file_too_large") return t("importFileTooLarge");
    if (message === "unsupported_file") return t("importUnsupportedFile");
    return t("importFailed");
  }

  async function importFile(file: File) {
    setImportBusy(true);
    setImportError("");
    setImportResult(null);
    try {
      const text = await extractImportFileText(file);
      if (!text.trim()) throw new Error("unsupported_file");
      const suggestion = await analyzeCalendarText({
        text,
        fileName: file.name,
        timezone: draft.timezone,
      });
      applyImportSuggestion(suggestion, file.name);
    } catch (error) {
      setImportError(importErrorMessage(error));
    } finally {
      setImportBusy(false);
    }
  }

  async function importFromUrl(value = importUrl) {
    let url: string;
    try {
      url = normalizeCalendarUrl(value);
    } catch {
      setImportError(t("importInvalidUrl"));
      return;
    }
    setImportUrl(url);
    setImportBusy(true);
    setImportError("");
    setImportResult(null);
    try {
      const suggestion = await analyzeCalendarUrl({
        url,
        timezone: draft.timezone,
      });
      applyImportSuggestion(suggestion, new URL(url).hostname);
    } catch (error) {
      setImportError(importErrorMessage(error));
    } finally {
      setImportBusy(false);
    }
  }

  function acceptImportTransfer(transfer: DataTransfer) {
    const file = transfer.files?.[0];
    if (file) {
      void importFile(file);
      return;
    }
    const url =
      transfer.getData("text/uri-list").split("\n").find(Boolean) ??
      transfer.getData("text/plain");
    if (url) void importFromUrl(url);
  }

  const importFieldLabels: Record<string, string> = {
    title: t("eventTitle"),
    location: t("location"),
    address: t("address"),
    description: t("descriptionLabel"),
    date: t("start"),
    startTime: t("start"),
    endTime: t("end"),
    endDate: t("end"),
    timezone: t("timezone"),
    repeat: t("repeat"),
  };

  return (
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-medium">{t("importTitle")}</summary>
    <section
      className={cn(
        "rounded-xl border border-dashed bg-muted/15 p-3 transition-colors",
        importBusy
          ? "border-[#6D5EF7]/60 bg-[#6D5EF7]/5"
          : "border-border hover:border-[#6D5EF7]/40",
      )}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(event) => {
        event.preventDefault();
        acceptImportTransfer(event.dataTransfer);
      }}
      onPaste={(event) => {
        const file = event.clipboardData.files?.[0];
        if (file) {
          event.preventDefault();
          void importFile(file);
          return;
        }
        const value = event.clipboardData.getData("text/plain");
        if (/^https?:\/\//i.test(value.trim())) {
          event.preventDefault();
          void importFromUrl(value);
        }
      }}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-background text-[#6D5EF7]">
          {importBusy ? (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <FileUp className="size-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t("importTitle")}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("importDescription")}
          </p>
        </div>
        <input
          ref={importFileInput}
          type="file"
          accept=".ics,.txt,.md,.csv,.json,.pdf,text/calendar,text/plain,application/pdf"
          className="hidden"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) void importFile(file);
            event.currentTarget.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={importBusy}
          onClick={() => importFileInput.current?.click()}
        >
          {t("chooseFile")}
        </Button>
      </div>
      <div className="mt-3 flex gap-2">
        <label className="relative min-w-0 flex-1">
          <Link2 className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            value={importUrl}
            disabled={importBusy}
            placeholder={t("importUrlPlaceholder")}
            className="pl-8"
            onChange={(event) => {
              setImportUrl(event.target.value);
              if (importError) setImportError("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void importFromUrl();
              }
            }}
          />
        </label>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={importBusy || !importUrl.trim()}
          onClick={() => void importFromUrl()}
        >
          {t("analyze")}
        </Button>
      </div>
      <div className="mt-2 min-h-5" aria-live="polite">
        {importBusy && (
          <p className="text-xs text-muted-foreground">
            {t("importAnalyzing")}
          </p>
        )}
        {importError && (
          <p className="text-xs font-medium text-destructive">
            {importError}
          </p>
        )}
        {importResult && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <Check className="size-3.5 text-[#059669]" />
            <span className="font-medium">{importResult.label}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {importResult.method === "ai"
                ? t("importMethodAi")
                : t("importMethodParser")}
            </span>
            {importResult.fields.length > 0 ? (
              importResult.fields.map((field) => (
                <span
                  key={field}
                  className="rounded-full border bg-background px-2 py-0.5 text-[10px] text-muted-foreground"
                >
                  {importFieldLabels[field]}
                </span>
              ))
            ) : (
              <span className="text-muted-foreground">
                {t("importNoNewFields")}
              </span>
            )}
          </div>
        )}
      </div>
    </section>
    </details>
  );
}
