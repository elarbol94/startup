import { requireUser } from "@/lib/auth";
import { listPresentations } from "@/modules/wiki/presentation-queries";
import { PresentationLibrary } from "@/modules/wiki/components/presentation-library";

export default async function PresentationsPage() {
  const viewer = await requireUser();
  return <PresentationLibrary presentations={listPresentations(viewer)} />;
}
