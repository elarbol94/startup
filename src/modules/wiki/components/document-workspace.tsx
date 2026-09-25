"use client";

import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { CollaborationClient } from "../collaboration/provider";

export type DocumentTool = "outline" | "comments" | "layout" | "details" | "image" | null;
const DocumentWorkspace = createContext<{
  panel: DocumentTool; setPanel: Dispatch<SetStateAction<DocumentTool>>;
  /** The page's live collaboration transport: the one source of its save status. */
  collaboration: CollaborationClient | null; setCollaboration: Dispatch<SetStateAction<CollaborationClient | null>>;
} | null>(null);

export function DocumentWorkspaceProvider({ children }: { children: ReactNode }) {
  const [panel, setPanel] = useState<DocumentTool>(null);
  const [collaboration, setCollaboration] = useState<CollaborationClient | null>(null);
  return <DocumentWorkspace.Provider value={{ panel, setPanel, collaboration, setCollaboration }}>{children}</DocumentWorkspace.Provider>;
}

export function useDocumentWorkspace() {
  const value = useContext(DocumentWorkspace);
  if (!value) throw new Error("Document tools require their workspace provider");
  return value;
}
