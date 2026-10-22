import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getPresentation } from "@/modules/wiki/presentation-queries";
import { PresentationPlayer } from "@/modules/wiki/components/presentation-player";

/** `?from=<step id>` starts at that stop ("from current stop" in the editor). */
export default async function PresentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string | string[] }> }) {
  const [viewer, { id }, { from }] = await Promise.all([requireUser(), params, searchParams]);
  const presentation = getPresentation(id, viewer);
  if (!presentation) notFound();
  return <PresentationPlayer presentation={presentation} startStepId={typeof from === "string" ? from : undefined} />;
}
