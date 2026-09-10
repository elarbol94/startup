"use client";

import { UserIdentity } from "@/components/user-identity";

import { useTranslations } from "next-intl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function TaskAssigneeSelect({ id, value, onChange, members, assignedMembers = [] }: {
  id: string;
  value: string[];
  onChange: (value: string[]) => void;
  members: Array<{ id: string; name: string }>;
  assignedMembers?: Array<{ id: string; name: string }>;
}) {
  const t = useTranslations("tasks");
  const options = [...members, ...assignedMembers.filter((member) =>
    value.includes(member.id) && !members.some((active) => active.id === member.id))];
  const label = value.length
    ? value.map((id) => options.find((member) => member.id === id)?.name ?? id).join(", ")
    : t("unassigned");
  return (
    <Select multiple value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full" aria-label={t("assignees")}>
        <SelectValue><span className="flex flex-wrap gap-1">{value.length ? value.map(id => <UserIdentity key={id} userId={id} name={options.find(member => member.id === id)?.name ?? id} />) : label}</span></SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((member) => <SelectItem key={member.id} value={member.id}><UserIdentity userId={member.id} name={member.name} /></SelectItem>)}
      </SelectContent>
    </Select>
  );
}
