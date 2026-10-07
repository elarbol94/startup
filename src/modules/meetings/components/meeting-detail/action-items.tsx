"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { decideActionItem } from "../../action-item-actions";
import type { ProtocolActionItem } from "../../protocol-content";
import type { MeetingDetail } from "../../queries";
import type { MeetingFormOptions } from "../new-meeting-dialog";
import { selectClassName, useMeetingAction } from "../meeting-ui";

/** Action items of the approved protocol: accept (creates a task) or reject. */
export function ActionItems({ detail, protocolId, items, options }: {
  detail: MeetingDetail;
  protocolId: string;
  items: ProtocolActionItem[];
  options: MeetingFormOptions;
}) {
  const t = useTranslations("meetings");
  const { pending, run } = useMeetingAction();
  const [accepting, setAccepting] = useState<ProtocolActionItem | null>(null);
  const canContribute = detail.role !== "viewer";
  if (!items.length) return <p className="text-sm text-muted-foreground">{t("actionItems.none")}</p>;
  const memberName = (userId: string | null) => detail.members.find((member) => member.userId === userId)?.name;

  return (
    <>
      <ul className="space-y-2">
        {items.map((item) => {
          const decision = detail.decisions.find((entry) => entry.itemKey === item.itemKey);
          return (
            <li key={item.itemKey} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-sm">
                <p>{item.text}</p>
                <p className="text-xs text-muted-foreground">
                  {[memberName(item.assigneeUserId), item.dueDate].filter(Boolean).join(" · ") || t("protocol.noAssignee")}
                </p>
              </div>
              {decision ? (
                decision.status === "accepted" ? (
                  <Badge variant="secondary" render={decision.taskProjectId ? <Link href={`/projects/${decision.taskProjectId}`} /> : undefined}>
                    <Check />{decision.taskTitle ? t("actionItems.taskCreated", { title: decision.taskTitle }) : t("actionItems.accepted")}
                  </Badge>
                ) : <Badge variant="outline">{t("actionItems.rejected")}</Badge>
              ) : canContribute && (
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => decideActionItem({ meetingId: detail.meeting.id, protocolId, itemKey: item.itemKey, accept: false }))}>
                    <X />{t("actionItems.reject")}
                  </Button>
                  <Button size="sm" onClick={() => setAccepting(item)}><Check />{t("actionItems.accept")}</Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <Dialog open={accepting !== null} onOpenChange={(open) => !open && setAccepting(null)}>
        {accepting && (
          <AcceptForm key={accepting.itemKey} item={accepting} detail={detail} protocolId={protocolId} options={options} onClose={() => setAccepting(null)} />
        )}
      </Dialog>
    </>
  );
}

function AcceptForm({ item, detail, protocolId, options, onClose }: {
  item: ProtocolActionItem; detail: MeetingDetail; protocolId: string; options: MeetingFormOptions; onClose: () => void;
}) {
  const t = useTranslations("meetings");
  const id = useId();
  const { pending, run } = useMeetingAction();
  const [title, setTitle] = useState(item.text.slice(0, 300));
  const [projectId, setProjectId] = useState(detail.meeting.projectId ?? "");
  const [assignees, setAssignees] = useState<Set<string>>(new Set(item.assigneeUserId ? [item.assigneeUserId] : []));
  const [dueDate, setDueDate] = useState(item.dueDate ?? "");

  function submit() {
    run(() => decideActionItem({
      meetingId: detail.meeting.id, protocolId, itemKey: item.itemKey, accept: true,
      task: { title, projectId: projectId || null, assigneeIds: [...assignees], dueDate: dueDate || null },
    }), onClose);
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{t("actionItems.acceptTitle")}</DialogTitle>
        <DialogDescription>{t("actionItems.acceptDescription")}</DialogDescription>
      </DialogHeader>
      {detail.meeting.confidential && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">{t("actionItems.confidentialWarning")}</p>}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-title`}>{t("actionItems.taskTitle")}</Label>
          <Input id={`${id}-title`} value={title} maxLength={300} onChange={(event) => setTitle(event.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-project`}>{t("fields.project")}</Label>
            <select id={`${id}-project`} className={selectClassName} value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">{t("fields.noProject")}</option>
              {options.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-due`}>{t("protocol.dueDate")}</Label>
            <Input id={`${id}-due`} type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </div>
        </div>
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">{t("actionItems.assignees")}</legend>
          <div className="grid max-h-36 gap-1.5 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2">
            {options.users.map((candidate) => (
              <label key={candidate.id} className="flex items-center gap-2 text-sm">
                <Checkbox checked={assignees.has(candidate.id)} onCheckedChange={(checked) => setAssignees((current) => {
                  const next = new Set(current);
                  if (checked === true) next.add(candidate.id); else next.delete(candidate.id);
                  return next;
                })} />
                {candidate.name}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>{t("cancel")}</Button>
        <Button disabled={pending || !title.trim()} onClick={submit}>{t("actionItems.createTask")}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
