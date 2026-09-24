// Shared types for the wiki page editor: props, imperative handle, page/source refs and
// derived document records. Used by wiki-editor.tsx and the pieces in this folder.
import type { ReactNode, RefObject } from "react";
import type { ProofingLanguage } from "../../lib/spellcheck";
import type { WikiProofingPrefsV1 } from "../../lib/wiki-proofing-prefs";
import type { StoredDocumentTemplate } from "../../document-queries";
import type { UserMarkColor } from "@/lib/user-mark-colors";
import type { CommentThread } from "../comment-rail";
import type { ContextDeadlineMarker, ContextTaskMarker } from "@/modules/tasks/types";
import type { CitationSource, CitationStyle } from "../../lib/citations";
import type { ProposalWorkspaceData } from "../../lib/proposal";
import type { WikiTypographySettingsV1, WikiTypographyTemplate } from "../../lib/wiki-typography";

export type PageRef = { id: string; title: string; slug: string };
export type SourceRef = CitationSource;
export type WikiEditorPageActions = { addAttachment: () => void; linkSupportingSource: () => void };
export type WikiEditorHandle = {
  flushSave: () => Promise<boolean>;
  insertGraphic: (asset: { attachmentId: string; fileName: string; contentUrl: string; caption?: string | null }) => void;
};
export type FigureCaption = { nodeId: string; caption: string };
export type TableCaption = { tableId: string; caption: string };
export type CitationTarget = { sourceId: string; documentId?: string; annotationId?: string; locator?: string };

export type WikiEditorProps = {
  details: ReactNode;
  focused?: boolean;
  pageId: string;
  pageTitle: string;
  pageSlug: string;
  pageVersion: number;
  pageContentVersion: number;
  initialContent: string;
  initialProofingLanguage: ProofingLanguage;
  initialProofingPrefs: WikiProofingPrefsV1;
  initialDocumentMode: boolean;
  initialDocumentSettings: string;
  documentTemplates: StoredDocumentTemplate[];
  allPages: PageRef[];
  sources: SourceRef[];
  users: Array<{ id: string; name: string; markColor: UserMarkColor }>;
  citationLocale: string;
  citationStyle: CitationStyle;
  insertEvidenceId?: string;
  comments: CommentThread[];
  currentUserId: string;
  contextTasks: ContextTaskMarker[];
  contextDeadlines: ContextDeadlineMarker[];
  proposalData: ProposalWorkspaceData;
  focusTaskId?: string;
  focusDeadlineId?: string;
  pageActions: WikiEditorPageActions;
  actionsRef?: RefObject<WikiEditorHandle | null>;
  initialTypography: WikiTypographySettingsV1;
  editableTypography: WikiTypographySettingsV1;
  typographyTemplates: WikiTypographyTemplate[];
  isPrimaryAuthor: boolean;
};

export type UploadedAttachment = { id: string; fileName: string; mimeType: string };
export type ExistingImageAttachment = UploadedAttachment & { src?: string };

export type EvidenceRef = {
  id: string;
  sourceId: string;
  documentId: string;
  pageNumber: number;
  kind: string;
  selectedText: string;
  note: string;
  label: string;
  sourceTitle: string;
};
