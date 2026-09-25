import { requireUser } from "@/lib/auth";
import { getTimeWorkspace } from "@/modules/time/queries";
import { TimeWorkspace } from "@/modules/time/components/time-workspace";

export default async function TimePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const viewer = await requireUser();
  const params = await searchParams;
  const data = getTimeWorkspace(viewer, { week: params.week });
  return <TimeWorkspace data={data} />;
}
