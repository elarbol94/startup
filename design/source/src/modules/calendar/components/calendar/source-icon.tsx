// Icon for a calendar item's source kind (event, focus, deadline, task, project).
// Used by the calendar views and the inspector.
import {
  AlarmClock,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  Focus,
} from "lucide-react";
import type { CalendarItem } from "../../types";

export function SourceIcon({ kind }: { kind: CalendarItem["kind"] }) {
  if (kind === "deadline") return <AlarmClock className="size-3.5" />;
  if (kind === "focus") return <Focus className="size-3.5" />;
  if (kind === "project") return <BriefcaseBusiness className="size-3.5" />;
  if (kind === "task" || kind === "milestone") {
    return <Check className="size-3.5" />;
  }
  return <CalendarDays className="size-3.5" />;
}
