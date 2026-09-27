import { FileText, FolderKanban, Landmark } from "lucide-react";
import type { ContactLinkTargetType } from "../constants";

const icons = { project: FolderKanban, fundingProject: Landmark, wikiPage: FileText } as const;

export function LinkTargetIcon({ type, className }: { type: ContactLinkTargetType; className?: string }) {
  const Icon = icons[type];
  return <Icon className={className} aria-hidden="true" />;
}
