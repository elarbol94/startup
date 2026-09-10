"use client";
import { UserIdentity } from "@/components/user-identity";
import { type ReactNode } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ItemDetails } from "./item-details";
import { useDeadlineCreator } from "./deadline-create-provider";
import { deadlineEditOptions } from "../deadline-utils";
import { withWorkItemFocus } from "@/modules/context/routes";
import type { DeadlineWithContext } from "../types";

export function DeadlineDetails({ deadline, children, className }: { deadline: DeadlineWithContext & { assigneeName?: string | null }; children: ReactNode; className?: string }) {
  const t = useTranslations("deadlines");
  const format = useFormatter();
  const { openDeadlineCreator } = useDeadlineCreator();
  return <ItemDetails title={deadline.title} description={deadline.description}
    origin={deadline.contextLabel || t("origins.app")}
    href={withWorkItemFocus(deadline.contextRoute || "/", deadline.id, "deadline")}
    onEdit={() => openDeadlineCreator(deadlineEditOptions(deadline, t("origins.app")))}
    fields={[
      { label: t("filterAssignee"), value: deadline.assigneeId ? <UserIdentity userId={deadline.assigneeId} name={deadline.assigneeName} /> : t("unassigned") },
      { label: t("filterStatus"), value: t(`statuses.${deadline.status}`) },
      { label: t("date"), value: format.dateTime(new Date(`${deadline.deadlineDate}T12:00:00`), { dateStyle: "long" }) },
      { label: t("time"), value: deadline.deadlineAt ? format.dateTime(new Date(deadline.deadlineAt), { timeStyle: "short" }) : t("allDay") },
    ]} className={className}>{children}</ItemDetails>;
}
