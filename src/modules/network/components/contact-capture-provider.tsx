"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { PencilLine, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getQuickCaptureOptions } from "../capture-actions";
import { QuickCaptureDialog, type QuickCaptureOptions } from "./quick-capture-dialog";
import { useCaptureDraft } from "./quick-capture-draft";

type ContactCaptureContextValue = {
  openContactCapture: () => void;
  /** A capture was started and not yet saved or discarded. */
  hasDraft: boolean;
};

const ContactCaptureContext = createContext<ContactCaptureContextValue | null>(null);
const noOptions: QuickCaptureOptions = { contacts: [], tags: [], metContexts: [] };

export function useContactCapture() {
  const value = useContext(ContactCaptureContext);
  if (!value) throw new Error("useContactCapture must be used inside ContactCaptureProvider");
  return value;
}

/**
 * Quick capture from anywhere ("Neu" menu, network page): one dialog and one
 * draft for the whole app. Suggestions load each time it opens, so contacts
 * and tags added meanwhile are offered.
 */
export function ContactCaptureProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const t = useTranslations("network");
  const draft = useCaptureDraft(userId);
  const [open, setOpen] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [options, setOptions] = useState<QuickCaptureOptions>(noOptions);
  const { hasDraft, clear, restored } = draft;

  const openContactCapture = useCallback(() => {
    setResumed(hasDraft);
    setOpen(true);
    void getQuickCaptureOptions().then(setOptions).catch(() => undefined);
  }, [hasDraft]);

  const value = useMemo(() => ({ openContactCapture, hasDraft }), [openContactCapture, hasDraft]);

  return (
    <ContactCaptureContext.Provider value={value}>
      {children}
      <QuickCaptureDialog
        open={open}
        onClose={() => setOpen(false)}
        draft={draft}
        showDraftHint={resumed || restored}
        onDiscard={() => {
          clear();
          setResumed(false);
          toast(t("quick.discarded"));
        }}
        options={options}
      />
    </ContactCaptureContext.Provider>
  );
}

/** The capture button on the network pages; says "continue" while a draft waits. */
export function QuickCaptureButton() {
  const t = useTranslations("network");
  const { openContactCapture, hasDraft } = useContactCapture();
  return (
    <Button size="sm" onClick={openContactCapture} data-testid="network-quick-capture" data-draft={hasDraft || undefined}>
      {hasDraft ? <PencilLine className="size-4" /> : <Plus className="size-4" />}
      {hasDraft ? t("quick.continue") : t("quick.button")}
    </Button>
  );
}
