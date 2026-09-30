import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { getPresentation, listPresentationRevisions } from "@/modules/wiki/presentation-queries";
import { PresentationEditor } from "@/modules/wiki/components/presentation-editor";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const [viewer, { id }, t] = await Promise.all([requireUser(), params, getTranslations("wiki.presentations")]);
  const presentation = getPresentation(id, viewer);
  // The editor keeps this in step when the deck is renamed.
  return presentation ? { title: { absolute: t("documentTitle", { title: presentation.title }) } } : {};
}

export default async function PresentationEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const [viewer, { id }] = await Promise.all([requireUser(), params]);
  const presentation = getPresentation(id, viewer);
  if (!presentation) notFound();
  return <PresentationEditor presentation={presentation} revisions={presentation.role === "edit" || presentation.role === "owner" ? listPresentationRevisions(id, viewer) : []} />;
}
