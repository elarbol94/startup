"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { meetingAccessRoles, type MeetingAccessRole } from "../../constants";
import { setMeetingAccess, setMeetingAiPolicy, updateMeeting } from "../../meeting-actions";
import type { MeetingDetail } from "../../queries";
import type { MeetingFormOptions } from "../new-meeting-dialog";
import { selectClassName, useMeetingAction } from "../meeting-ui";

/** `Date` → value of a datetime-local input in the browser's time zone. */
function localInputValue(date: Date | null) {
  if (!date) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function SettingsDialog({ open, onOpenChange, detail, options }: {
  open: boolean; onOpenChange: (open: boolean) => void; detail: MeetingDetail; options: MeetingFormOptions;
}) {
  const t = useTranslations("meetings");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("settings.title")}</DialogTitle>
            <DialogDescription>{t("settings.description")}</DialogDescription>
          </DialogHeader>
          <DetailsForm detail={detail} options={options} />
          <MembersForm detail={detail} options={options} />
          <AiForm detail={detail} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function DetailsForm({ detail, options }: { detail: MeetingDetail; options: MeetingFormOptions }) {
  const t = useTranslations("meetings");
  const id = useId();
  const { pending, run } = useMeetingAction();
  const meeting = detail.meeting;
  const [form, setForm] = useState({
    title: meeting.title, agenda: meeting.agenda, startsAt: localInputValue(meeting.startsAt), projectId: meeting.projectId ?? "",
    language: meeting.language as "de" | "en", videoRetentionDays: meeting.videoRetentionDays, audioRetentionDays: meeting.audioRetentionDays,
  });
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));
  return (
    <section className="space-y-3">
      <h3 className="font-medium">{t("settings.details")}</h3>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-title`}>{t("fields.title")}</Label>
        <Input id={`${id}-title`} value={form.title} maxLength={200} onChange={(event) => set({ title: event.target.value })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-starts`}>{t("fields.startsAt")}</Label>
          <Input id={`${id}-starts`} type="datetime-local" value={form.startsAt} onChange={(event) => set({ startsAt: event.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-project`}>{t("fields.project")}</Label>
          <select id={`${id}-project`} className={selectClassName} value={form.projectId} onChange={(event) => set({ projectId: event.target.value })}>
            <option value="">{t("fields.noProject")}</option>
            {options.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-language`}>{t("fields.language")}</Label>
          <select id={`${id}-language`} className={selectClassName} value={form.language} onChange={(event) => set({ language: event.target.value as "de" | "en" })}>
            <option value="de">Deutsch</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-agenda`}>{t("fields.agenda")}</Label>
        <Textarea id={`${id}-agenda`} rows={3} value={form.agenda} maxLength={10_000} onChange={(event) => set({ agenda: event.target.value })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-video`}>{t("fields.videoRetention")}</Label>
          <Input id={`${id}-video`} type="number" min={1} max={3650} value={form.videoRetentionDays} onChange={(event) => set({ videoRetentionDays: Number(event.target.value) })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-audio`}>{t("fields.audioRetention")}</Label>
          <Input id={`${id}-audio`} type="number" min={1} max={3650} value={form.audioRetentionDays} onChange={(event) => set({ audioRetentionDays: Number(event.target.value) })} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t("fields.retentionHint")}</p>
      <div className="flex justify-end">
        <Button size="sm" disabled={pending || !form.title.trim()} onClick={() => run(() => updateMeeting({
          id: meeting.id, ...form, startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null, projectId: form.projectId || null,
        }))}>{t("settings.saveDetails")}</Button>
      </div>
    </section>
  );
}

function MembersForm({ detail, options }: { detail: MeetingDetail; options: MeetingFormOptions }) {
  const t = useTranslations("meetings");
  const { pending, run } = useMeetingAction();
  const [members, setMembers] = useState(detail.members.map(({ userId, name, role }) => ({ userId, name, role })));
  const available = options.users.filter((candidate) => !members.some((member) => member.userId === candidate.id));
  return (
    <section className="space-y-3 border-t pt-4">
      <h3 className="font-medium">{t("settings.members")}</h3>
      <p className="text-xs text-muted-foreground">{t("settings.membersHint")}</p>
      <ul className="space-y-2">
        {members.map((member) => (
          <li key={member.userId} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{member.name}</span>
            <select className={`${selectClassName} w-36`} aria-label={t("settings.role")} value={member.role}
              onChange={(event) => setMembers((current) => current.map((entry) => entry.userId === member.userId ? { ...entry, role: event.target.value as MeetingAccessRole } : entry))}>
              {meetingAccessRoles.map((role) => <option key={role} value={role}>{t(`roles.${role}`)}</option>)}
            </select>
            <Button size="icon-sm" variant="ghost" aria-label={t("settings.removeMember", { name: member.name })}
              onClick={() => setMembers((current) => current.filter((entry) => entry.userId !== member.userId))}><X /></Button>
          </li>
        ))}
      </ul>
      {available.length > 0 && (
        <select className={selectClassName} aria-label={t("settings.addMember")} value="" onChange={(event) => {
          const user = available.find((candidate) => candidate.id === event.target.value);
          if (user) setMembers((current) => [...current, { userId: user.id, name: user.name, role: "participant" }]);
        }}>
          <option value="">{t("settings.addMember")}</option>
          {available.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
        </select>
      )}
      <div className="flex justify-end">
        <Button size="sm" disabled={pending} onClick={() => run(() => setMeetingAccess({ meetingId: detail.meeting.id, members: members.map(({ userId, role }) => ({ userId, role })) }))}>
          {t("settings.saveMembers")}
        </Button>
      </div>
    </section>
  );
}

function AiForm({ detail }: { detail: MeetingDetail }) {
  const t = useTranslations("meetings");
  const { pending, run } = useMeetingAction();
  const [aiEnabled, setAiEnabled] = useState(detail.meeting.aiPolicy === "openai");
  const [confidential, setConfidential] = useState(detail.meeting.confidential);
  const [declaration, setDeclaration] = useState(false);
  const enabling = aiEnabled && detail.meeting.aiPolicy === "none";
  const needsDeclaration = enabling && detail.recordings.some((recording) => recording.purgeState === "active");
  return (
    <section className="space-y-3 border-t pt-4">
      <h3 className="font-medium">{t("settings.ai")}</h3>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox className="mt-0.5" checked={aiEnabled} onCheckedChange={(checked) => setAiEnabled(checked === true)} />
        <span><span className="font-medium">{t("settings.aiEnabled")}</span><span className="block text-xs text-muted-foreground">{t("settings.aiHint")}</span></span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox className="mt-0.5" checked={confidential} onCheckedChange={(checked) => setConfidential(checked === true)} />
        <span><span className="font-medium">{t("fields.confidential")}</span><span className="block text-xs text-muted-foreground">{t("fields.confidentialHint")}</span></span>
      </label>
      {needsDeclaration && (
        <label className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-sm">
          <Checkbox className="mt-0.5" checked={declaration} onCheckedChange={(checked) => setDeclaration(checked === true)} />
          <span>{t("settings.aiDeclaration")}</span>
        </label>
      )}
      <div className="flex justify-end">
        <Button size="sm" disabled={pending || (needsDeclaration && !declaration)} onClick={() => run(() => setMeetingAiPolicy({
          meetingId: detail.meeting.id, aiPolicy: aiEnabled ? "openai" : "none", confidential, aiDeclaration: declaration,
        }))}>{t("settings.saveAi")}</Button>
      </div>
    </section>
  );
}
