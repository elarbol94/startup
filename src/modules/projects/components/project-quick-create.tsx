"use client";

// "+ New" on the project page: everything created here starts linked to the project.
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CalendarPlus, ClipboardPlus, Clock3, FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { requestAppNavigation } from "@/lib/app-navigation";
import { useTaskCreator } from "@/modules/tasks/components/task-create-provider";
import { withProjectParam } from "../current-project";

export function ProjectQuickCreate({ projectId, projectName }: { projectId: string; projectName: string }) {
  const t = useTranslations("projectLinks.quickCreate");
  const router = useRouter();
  const { openTaskCreator } = useTaskCreator();

  function go(path: string) {
    const href = withProjectParam(path, projectId);
    requestAppNavigation(href, () => router.push(href));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" />}>
        <Plus className="size-4" />
        {t("new")}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <span className="block truncate">{t("inProject", { name: projectName })}</span>
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={() => openTaskCreator({ projectId })}>
            <ClipboardPlus className="mr-1 size-4" />
            {t("task")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => go("/calendar?new=event")}>
            <CalendarPlus className="mr-1 size-4" />
            {t("event")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => go("/time")}>
            <Clock3 className="mr-1 size-4" />
            {t("time")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => go("/accounting/invoices/new")}>
            <FileText className="mr-1 size-4" />
            {t("invoice")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
