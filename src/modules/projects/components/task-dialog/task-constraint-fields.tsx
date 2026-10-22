// Constraint type and date fields of the task dialog with the hint for the chosen type.
// Used by task-dialog.tsx for leaf tasks (summaries have no constraint of their own).
"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ConstraintType } from "./task-dialog-types";

export function TaskConstraintFields({
  constraintType,
  setConstraintType,
  constraintDate,
  setConstraintDate,
  readOnly,
}: {
  constraintType: ConstraintType;
  setConstraintType: (value: ConstraintType) => void;
  constraintDate: string;
  setConstraintDate: (value: string) => void;
  readOnly: boolean;
}) {
  const t = useTranslations("projects");
  const constraintLabel = {
    asap: t("constraintAsap"),
    start_no_earlier_than: t("constraintNoEarlierThan"),
    must_start_on: t("constraintMustStartOn"),
  }[constraintType];
  const constraintHint = {
    asap: t("constraintAsapHint"),
    start_no_earlier_than: t("constraintNoEarlierThanHint"),
    must_start_on: t("constraintMustStartOnHint"),
  }[constraintType];

  return (
    <div className="grid gap-3 rounded-md border bg-muted/25 p-3">
      <div className="grid gap-2">
        <Label htmlFor="task-constraint-type">{t("constraintType")}</Label>
        <Select
          value={constraintType}
          onValueChange={(value) => setConstraintType((value ?? "asap") as ConstraintType)}
          disabled={readOnly}
        >
          <SelectTrigger id="task-constraint-type" className="w-full">
            <SelectValue>{constraintLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="asap">{t("constraintAsap")}</SelectItem>
            <SelectItem value="start_no_earlier_than">{t("constraintNoEarlierThan")}</SelectItem>
            <SelectItem value="must_start_on">{t("constraintMustStartOn")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {constraintType !== "asap" && (
        <div className="grid gap-2">
          <Label htmlFor="task-constraint-date">{t("constraintDate")}</Label>
          <Input
            id="task-constraint-date"
            type="date"
            value={constraintDate}
            onChange={(event) => setConstraintDate(event.target.value)}
            required={constraintType === "must_start_on"}
            disabled={readOnly}
          />
        </div>
      )}
      <p className="text-xs text-muted-foreground">{constraintHint}</p>
    </div>
  );
}
