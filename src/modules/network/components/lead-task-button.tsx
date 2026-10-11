"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CircleCheck, ListPlus, SquareCheckBig } from "lucide-react";
import { Button } from "@/components/ui/button";
import { canonicalTaskHref } from "@/modules/context/routes";
import { useTaskCreator } from "@/modules/tasks/components/task-create-provider";
import { linkNetworkLeadTask } from "../lead-actions";
import type { NetworkLeadView } from "../queries";
import { useNetworkAction } from "./use-network-action";

/**
 * Turns a lead's next step into a regular task (the app's task dialog) and
 * links it back. Tasks are visible to the team, so a private contact's name
 * is not used as the task's origin label.
 */
export function LeadTaskButton({ lead }: { lead: NetworkLeadView }) {
  const t = useTranslations("network");
  const { openTaskCreator } = useTaskCreator();
  const { run } = useNetworkAction();

  if (lead.task) {
    const done = lead.task.status === "done";
    const Icon = done ? CircleCheck : SquareCheckBig;
    return (
      <Link
        href={canonicalTaskHref(lead.task.id, lead.task.projectId)}
        className="inline-flex h-5 max-w-56 items-center gap-1 rounded-full bg-brand-soft px-2 text-[11px] font-semibold text-brand-ink hover:underline"
        title={lead.task.title}
      >
        <Icon className="size-3 shrink-0" />
        <span className="truncate">{done ? t("task.done") : t("task.open")}</span>
      </Link>
    );
  }

  return (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label={t("task.create")}
      title={t("task.create")}
      onClick={() => openTaskCreator({
        initialTitle: lead.nextStep || lead.summary,
        projectId: undefined,
        origin: {
          type: "app",
          entityId: lead.contactId,
          route: `/network/${lead.contactId}`,
          label: lead.contactVisibility === "team" ? lead.contactName : t("title"),
        },
        onCreated: (taskId) => run(() => linkNetworkLeadTask({ leadId: lead.id, taskId }), () => toast.success(t("task.linked"))),
      })}
    >
      <ListPlus />
    </Button>
  );
}
