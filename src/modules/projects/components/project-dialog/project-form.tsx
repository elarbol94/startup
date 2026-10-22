// Create/edit form of a project: name, description, colour, manager, planned dates and
// the predecessor (new projects) or links editor (existing ones). Used by project-dialog.tsx.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { UserIdentity } from "@/components/user-identity";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { upsertProject, type ProjectInput } from "@/modules/projects/actions";
import { addCalendarDays } from "@/modules/projects/schedule";
import { PredecessorSelect } from "./predecessor-select";
import type { ProjectMember, ProjectPredecessorOption, ProjectRecord } from "./project-dialog-types";
import { optionKey } from "./project-dialog-utils";
import { ProjectLinksEditor } from "./project-links-editor";

export function ProjectForm({
  project,
  members,
  predecessorOptions,
  onSaved,
}: {
  project: ProjectRecord | null;
  members: ProjectMember[];
  predecessorOptions: ProjectPredecessorOption[];
  onSaved: (project: ProjectRecord) => void;
}) {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [color, setColor] = useState(project?.color ?? "#2563eb");
  const [managerId, setManagerId] = useState(project?.managerId ?? "none");
  const [plannedStartDate, setPlannedStartDate] = useState(project?.plannedStartDate ?? "");
  const [targetEndDate, setTargetEndDate] = useState(project?.targetEndDate ?? "");
  const [predecessor, setPredecessor] = useState("none");
  const [pending, setPending] = useState(false);

  const selectableOptions = predecessorOptions.filter(
    (option) =>
      option.dueDate &&
      !(project && (option.type === "project" ? option.id === project.id : option.projectId === project.id)),
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const selected = !project && predecessor !== "none"
        ? selectableOptions.find((option) => optionKey(option) === predecessor)
        : undefined;
      const input: ProjectInput = {
        id: project?.id,
        name,
        description,
        color,
        managerId: managerId === "none" ? null : managerId,
        plannedStartDate: plannedStartDate || null,
        targetEndDate: targetEndDate || null,
        predecessor: selected ? { type: selected.type, id: selected.id } : null,
      };
      const saved = await upsertProject(input, [
        t("colOpen"),
        t("colInProgress"),
        t("colDone"),
      ]);
      toast.success(tCommon("saved"));
      onSaved(saved);
      router.refresh();
    } catch {
      toast.error(tCommon("error"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="project-name">{t("name")}</Label>
        <Input
          id="project-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={200}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="project-description">{t("description")}</Label>
        <Textarea
          id="project-description"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={2000}
        />
      </div>
      <div className="grid grid-cols-[5rem_1fr] gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="project-color">{t("color")}</Label>
          <ColorPicker
            aria-label={t("color")}
            id="project-color"
            value={color}
            onChange={setColor}
            className="h-9 w-full cursor-pointer rounded-md border bg-background p-1"
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="project-manager">{t("manager")}</Label>
          <Select value={managerId} onValueChange={(value) => setManagerId(value ?? "none")}>
            <SelectTrigger id="project-manager" className="w-full">
              <SelectValue>
                {managerId === "none" ? t("unassigned") : <UserIdentity userId={managerId} />}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("unassigned")}</SelectItem>
              {members.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  <UserIdentity userId={member.id} name={member.name} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="project-planned-start">{t("plannedStart")}</Label>
          <Input
            id="project-planned-start"
            type="date"
            value={plannedStartDate}
            onChange={(event) => setPlannedStartDate(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="project-target-end">{t("targetEnd")}</Label>
          <Input
            id="project-target-end"
            type="date"
            min={plannedStartDate || undefined}
            value={targetEndDate}
            onChange={(event) => setTargetEndDate(event.target.value)}
          />
        </div>
      </div>
      {project ? (
        <ProjectLinksEditor
          project={project}
          options={selectableOptions}
          onProjectChanged={(changed) => {
            // A new predecessor may have moved this project; keep the form in sync
            // so saving doesn't move it back.
            setPlannedStartDate(changed.plannedStartDate ?? "");
            setTargetEndDate(changed.targetEndDate ?? "");
          }}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="project-predecessor">{t("projectPredecessors")}</Label>
          <PredecessorSelect
            id="project-predecessor"
            value={predecessor}
            options={selectableOptions}
            onChange={(next) => {
              setPredecessor(next);
              const selected = selectableOptions.find((option) => optionKey(option) === next);
              if (selected?.dueDate) setPlannedStartDate(addCalendarDays(selected.dueDate, 1));
            }}
          />
          <p className="text-xs text-muted-foreground">{t("projectPredecessorNote")}</p>
        </div>
      )}
      <Button type="submit" disabled={pending}>
        {tCommon("save")}
      </Button>
    </form>
  );
}
