"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createMeeting } from "../meeting-actions";
import { selectClassName, useMeetingAction } from "./meeting-ui";

export type MeetingFormOptions = {
  users: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; name: string }>;
};

export function NewMeetingDialog({ open, onOpenChange, options, viewerId }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: MeetingFormOptions;
  viewerId: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <NewMeetingForm options={options} viewerId={viewerId} onClose={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function NewMeetingForm({ options, viewerId, onClose }: { options: MeetingFormOptions; viewerId: string; onClose: () => void }) {
  const t = useTranslations("meetings");
  const common = useTranslations("common");
  const id = useId();
  const router = useRouter();
  const { pending, run } = useMeetingAction();
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [projectId, setProjectId] = useState("");
  const [agenda, setAgenda] = useState("");
  const [confidential, setConfidential] = useState(false);
  const [participants, setParticipants] = useState<Set<string>>(new Set());

  function submit(event: FormEvent) {
    event.preventDefault();
    run(() => createMeeting({
      title,
      agenda,
      startsAt: startsAt ? new Date(startsAt).toISOString() : null,
      projectId: projectId || null,
      confidential,
      participantIds: [...participants],
    }), (result) => {
      onClose();
      router.push(`/meetings/${result.meetingId}`);
    });
  }

  const toggle = (userId: string, checked: boolean) => setParticipants((current) => {
    const next = new Set(current);
    if (checked) next.add(userId); else next.delete(userId);
    return next;
  });

  return (
    <DialogContent className="sm:max-w-xl">
      <form onSubmit={submit} className="space-y-4">
        <DialogHeader>
          <DialogTitle>{t("new.title")}</DialogTitle>
          <DialogDescription>{t("new.description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-title`}>{t("fields.title")}</Label>
          <Input id={`${id}-title`} value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={200} autoFocus />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-starts`}>{t("fields.startsAt")}</Label>
            <Input id={`${id}-starts`} type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-project`}>{t("fields.project")}</Label>
            <select id={`${id}-project`} className={selectClassName} value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">{t("fields.noProject")}</option>
              {options.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-agenda`}>{t("fields.agenda")}</Label>
          <Textarea id={`${id}-agenda`} value={agenda} onChange={(event) => setAgenda(event.target.value)} rows={3} maxLength={10_000} placeholder={t("fields.agendaHint")} />
        </div>
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">{t("fields.participants")}</legend>
          <p className="text-xs text-muted-foreground">{t("fields.participantsHint")}</p>
          <div className="grid max-h-40 gap-1.5 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2">
            {options.users.filter((candidate) => candidate.id !== viewerId).map((candidate) => (
              <label key={candidate.id} className="flex items-center gap-2 text-sm">
                <Checkbox checked={participants.has(candidate.id)} onCheckedChange={(checked) => toggle(candidate.id, checked === true)} />
                {candidate.name}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox className="mt-0.5" checked={confidential} onCheckedChange={(checked) => setConfidential(checked === true)} />
          <span>
            <span className="font-medium">{t("fields.confidential")}</span>
            <span className="block text-xs text-muted-foreground">{t("fields.confidentialHint")}</span>
          </span>
        </label>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>{common("cancel")}</Button>
          <Button type="submit" disabled={pending || !title.trim()}>{t("new.submit")}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
