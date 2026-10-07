"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveProtocolVersion } from "../../protocol-actions";
import type { ProtocolContent } from "../../protocol-content";
import { useMeetingAction } from "../meeting-ui";

const newKey = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 8)}`;

type ListName = "decisions" | "openQuestions";

/** Edits a protocol; saving creates a new version based on `baseProtocolId`. */
export function ProtocolEditor({ meetingId, baseProtocolId, initial, members, onClose }: {
  meetingId: string;
  baseProtocolId: string | null;
  initial: ProtocolContent;
  members: Array<{ userId: string; name: string }>;
  onClose: () => void;
}) {
  const t = useTranslations("meetings");
  const { pending, run } = useMeetingAction();
  const [content, setContent] = useState<ProtocolContent>(initial);
  const patch = (next: Partial<ProtocolContent>) => setContent((current) => ({ ...current, ...next }));

  function save() {
    const clean: ProtocolContent = {
      ...content,
      agendaItems: content.agendaItems.filter((item) => item.title.trim()),
      decisions: content.decisions.filter((item) => item.text.trim()),
      actionItems: content.actionItems.filter((item) => item.text.trim()),
      openQuestions: content.openQuestions.filter((item) => item.text.trim()),
    };
    run(() => saveProtocolVersion({ meetingId, baseProtocolId, content: clean }), onClose);
  }

  const simpleList = (list: ListName, label: string, prefix: string) => (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      {content[list].map((item, index) => (
        <div key={item.key} className="flex gap-2">
          <Textarea rows={2} value={item.text} aria-label={label} onChange={(event) => patch({ [list]: content[list].map((entry, position) => position === index ? { ...entry, text: event.target.value } : entry) })} />
          <Button size="icon-sm" variant="ghost" aria-label={t("protocol.removeItem")} onClick={() => patch({ [list]: content[list].filter((_, position) => position !== index) })}><X /></Button>
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={() => patch({ [list]: [...content[list], { key: newKey(prefix), text: "", evidence: [] }] })}><Plus />{t("protocol.addItem")}</Button>
    </fieldset>
  );

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="protocol-summary">{t("protocol.summary")}</label>
        <Textarea id="protocol-summary" rows={4} value={content.summary} onChange={(event) => patch({ summary: event.target.value })} />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("protocol.agenda")}</legend>
        {content.agendaItems.map((item, index) => (
          <div key={item.key} className="space-y-1.5 rounded-lg border p-2">
            <div className="flex gap-2">
              <Input value={item.title} aria-label={t("protocol.agendaTitle")} onChange={(event) => patch({ agendaItems: content.agendaItems.map((entry, position) => position === index ? { ...entry, title: event.target.value } : entry) })} />
              <Button size="icon-sm" variant="ghost" aria-label={t("protocol.removeItem")} onClick={() => patch({ agendaItems: content.agendaItems.filter((_, position) => position !== index) })}><X /></Button>
            </div>
            <Textarea rows={2} value={item.summary} aria-label={t("protocol.agendaSummary")} onChange={(event) => patch({ agendaItems: content.agendaItems.map((entry, position) => position === index ? { ...entry, summary: event.target.value } : entry) })} />
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => patch({ agendaItems: [...content.agendaItems, { key: newKey("a"), title: "", summary: "", evidence: [] }] })}><Plus />{t("protocol.addItem")}</Button>
      </fieldset>
      {simpleList("decisions", t("protocol.decisions"), "d")}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("protocol.actionItems")}</legend>
        {content.actionItems.map((item, index) => {
          const update = (next: Partial<typeof item>) => patch({ actionItems: content.actionItems.map((entry, position) => position === index ? { ...entry, ...next } : entry) });
          return (
            <div key={item.itemKey} className="space-y-1.5 rounded-lg border p-2">
              <div className="flex gap-2">
                <Textarea rows={2} value={item.text} aria-label={t("protocol.actionItems")} onChange={(event) => update({ text: event.target.value })} />
                <Button size="icon-sm" variant="ghost" aria-label={t("protocol.removeItem")} onClick={() => patch({ actionItems: content.actionItems.filter((_, position) => position !== index) })}><X /></Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <select className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm" aria-label={t("protocol.assignee")} value={item.assigneeUserId ?? ""} onChange={(event) => update({ assigneeUserId: event.target.value || null })}>
                  <option value="">{t("protocol.noAssignee")}</option>
                  {members.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}
                </select>
                <Input type="date" aria-label={t("protocol.dueDate")} value={item.dueDate ?? ""} onChange={(event) => update({ dueDate: event.target.value || null })} />
              </div>
            </div>
          );
        })}
        <Button size="sm" variant="outline" onClick={() => patch({ actionItems: [...content.actionItems, { itemKey: newKey("t"), text: "", assigneeUserId: null, dueDate: null, evidence: [] }] })}><Plus />{t("protocol.addItem")}</Button>
      </fieldset>
      {simpleList("openQuestions", t("protocol.openQuestions"), "q")}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>{t("cancel")}</Button>
        <Button disabled={pending} onClick={save}>{t("protocol.saveVersion")}</Button>
      </div>
    </div>
  );
}
