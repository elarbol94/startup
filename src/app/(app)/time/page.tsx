import { requireUser } from "@/lib/auth";
import { getTimeWorkspace } from "@/modules/time/queries";
import { TimeWorkspace } from "@/modules/time/components/time-workspace";

export default async function TimePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; project?: string }>;
}) {
  const viewer = await requireUser();
  const params = await searchParams;
  const data = getTimeWorkspace(viewer, { week: params.week });
  // Opened from a project page: new time starts on that project.
  const presetProjectId = data.projects.some((project) => project.id === params.project) ? params.project! : "";
  return <TimeWorkspace data={data} presetProjectId={presetProjectId} />;
}
