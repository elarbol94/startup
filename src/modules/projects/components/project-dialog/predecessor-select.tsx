// Select of a project or task predecessor, labelled by kind. Used by project-form.tsx
// and project-links-editor.tsx.
"use client";

import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProjectPredecessorOption } from "./project-dialog-types";
import { optionKey } from "./project-dialog-utils";

export function PredecessorSelect({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: ProjectPredecessorOption[];
}) {
  const t = useTranslations("projects");
  const label = (option: ProjectPredecessorOption) =>
    `${option.type === "project" ? t("projectLinkKindProject") : t("projectLinkKindTask")}: ${option.title}`;
  const selected = options.find((option) => optionKey(option) === value);
  return (
    <Select value={value} onValueChange={(next) => onChange(next ?? "none")}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue>{selected ? label(selected) : t("choosePredecessor")}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{t("choosePredecessor")}</SelectItem>
        {options.map((option) => (
          <SelectItem key={optionKey(option)} value={optionKey(option)}>
            {label(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
