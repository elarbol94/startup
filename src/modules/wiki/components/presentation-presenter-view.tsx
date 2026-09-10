"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { usePresentationSourcePreviews } from "./use-presentation-source-previews";
import { PresentationScene } from "./presentation-scene";
import { documentSectionHref, presentationSource, synchronizePresentationHeadings, sourceKey, sourceReviewStatus } from "../lib/presentation-source";
import { stepLabel, stepTarget } from "../lib/presentation";
import { formatElapsed, parsePresenterMessage, presenterChannelName } from "../lib/presenter";
import { CollaborationContext, CollaborationStatus, useCollaboration, useCollaborationContext } from "../collaboration/ui";
import * as Y from "yjs";
import { LOCAL, patchPresentation, presentationJSON } from "../collaboration/codec";
import type { PresentationRecord } from "../presentation-queries";

const subscribeHydration = () => () => {};

/**
 * A second window a presenter keeps to themselves while the audience watches the player.
 * It never drives its own camera — it only mirrors the player's current step over
 * BroadcastChannel, and its prev/next buttons steer the player rather than itself.
 */
export function PresentationPresenterView(props: { presentation: PresentationRecord; sessionId?: string }) {
  const provider = useCollaboration("presentation", props.presentation.id);
  return <CollaborationContext.Provider value={provider}>
    {provider.ready ? <SharedPresenterView {...props} /> : <CollaborationStatus provider={provider} />}
  </CollaborationContext.Provider>;
}
function SharedPresenterView({ presentation: initial, sessionId }: { presentation: PresentationRecord; sessionId?: string }) {
  const collaboration = useCollaborationContext()!;
  const undo = useRef<Y.UndoManager | null>(null);
  useEffect(() => {
    undo.current = new Y.UndoManager(collaboration.doc, { trackedOrigins: new Set([LOCAL]) });
    return () => { undo.current?.destroy(); undo.current = null; };
  }, [collaboration]);
  const [snapshot, setSnapshot] = useState(() => presentationJSON(collaboration.doc));
  useEffect(() => {
    const update = () => setSnapshot(presentationJSON(collaboration.doc));
    collaboration.doc.on("afterTransaction", update);
    return () => { collaboration.doc.off("afterTransaction", update); };
  }, [collaboration]);
  const presentation = { ...initial, ...snapshot };
  const t = useTranslations("wiki");
  const studio = useTranslations("presentationStudio");
  const linkText = useTranslations("documentPresentationLinks");
  const hydrated = useSyncExternalStore(subscribeHydration, () => true, () => false);
  const { steps } = presentation;
  const sourcePreviews = usePresentationSourcePreviews(presentation.elements.map((element) => element.source));
  const elements = useMemo(() => synchronizePresentationHeadings(snapshot.elements, sourcePreviews.previews), [snapshot.elements, sourcePreviews.previews]);
  const [index, setIndex] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [running, setRunning] = useState(true);
  const [saving, setSaving] = useState(false);
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (!running) return;
    let previous = Date.now();
    const timer = setInterval(() => { const now = Date.now(); setElapsedMs((elapsed) => elapsed + now - previous); previous = now; }, 250);
    return () => clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(presenterChannelName(presentation.id, sessionId));
    channelRef.current = channel;
    channel.onmessage = (event) => {
      const message = parsePresenterMessage(event.data);
      if (message?.type === "step") {
        setIndex(Math.min(Math.max(message.index, 0), Math.max(steps.length - 1, 0)));
      }
    };
    // The player may already be several steps in by the time this window opens.
    channel.postMessage({ type: "request-step" });
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [presentation.id, sessionId, steps.length]);

  const goTo = useCallback(
    (nextIndex: number) => {
      const clamped = Math.min(Math.max(nextIndex, 0), Math.max(steps.length - 1, 0));
      setIndex(clamped);
      channelRef.current?.postMessage({ type: "goto", index: clamped });
    },
    [steps.length],
  );

  const currentStep = steps[index] ?? null;
  const currentTarget = currentStep ? stepTarget(currentStep, elements) : null;
  const source = currentTarget ? presentationSource(elements, currentTarget.id) : null;
  const sourcePreview = source ? sourcePreviews.previews.get(sourceKey(source)) : undefined;
  async function openSource() {
    if (!source) return;
    const tab = window.open("about:blank", "_blank");
    if (!tab) { toast.error(t("presentations.popupBlocked")); return; }
    try {
      const response = await fetch(`/api/wiki/presentation-sources?source=${encodeURIComponent(source.pageId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (!result.document) { tab.close(); toast.error(linkText("missingSource")); return; }
      tab.opener = null;
      tab.location.href = documentSectionHref(result.document.slug, source.sectionId);
    } catch { tab.close(); toast.error(linkText("loadFailed")); }
  }
  const nextStep = steps[index + 1] ?? null;
  const nextTarget = nextStep ? stepTarget(nextStep, elements) : null;
  const notesValue = currentStep?.notes ?? "";
  const editable = hydrated && collaboration.status !== "denied" && collaboration.status !== "error";
  const updateNotes = (notes: string) => {
    if (!currentStep || !editable) return;
    const before = presentationJSON(collaboration.doc);
    patchPresentation(collaboration.doc, before, { ...before, steps: before.steps.map(step => step.id === currentStep.id ? { ...step, notes } : step) });
  };
  const saveNotes = async () => {
    if (!currentStep || saving) return;
    setSaving(true);
    try {
      if (!await collaboration.flush()) throw new Error("Save failed");
      toast.success(studio("notesSaved"));
    } catch { toast.error(studio("operationFailed")); } finally { setSaving(false); }
  };
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (collaboration.status === "saved") return;
      event.preventDefault(); event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [collaboration]);

  return (
    <div className="fixed inset-0 z-50 flex h-dvh flex-col bg-background p-4 sm:p-6">
      <header className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold tracking-wide text-muted-foreground uppercase">{presentation.title}</p>
          <p className="text-xs text-muted-foreground">
            {steps.length ? `${index + 1} / ${steps.length}` : t("presentations.noSteps")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-sm tabular-nums text-muted-foreground">
          <Clock className="size-4" />
          <span role="timer">{formatElapsed(elapsedMs)}</span>
          <Button type="button" size="sm" variant="outline" disabled={!hydrated} onClick={() => setRunning(!running)}>{running ? studio("pauseTimer") : studio("resumeTimer")}</Button>
          <Button type="button" size="sm" variant="outline" disabled={!hydrated} onClick={() => setElapsedMs(0)}>{studio("resetTimer")}</Button>
        </div>
      </header>

      <CollaborationStatus provider={collaboration} />
      <main className="mt-6 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        <div className="grid shrink-0 grid-cols-[2fr_1fr] gap-3 sm:gap-4">
          <section className="min-w-0"><h2 className="mb-2 text-sm font-medium">{studio("currentPreview")}</h2><div className="h-[22dvh] min-h-28 overflow-hidden rounded-md border sm:h-[32dvh]"><PresentationScene presentation={presentation} index={index} /></div></section>
          <section className="min-w-0"><h2 className="mb-2 text-sm font-medium">{studio("nextPreview")}</h2><div className="h-[22dvh] min-h-28 overflow-hidden rounded-md border sm:h-[32dvh]">{nextStep ? <PresentationScene presentation={presentation} index={index + 1} /> : <p className="p-4 text-sm text-muted-foreground">{t("presentations.noNextStep")}</p>}</div></section>
        </div>
        <section className="min-h-56 shrink-0 flex-1 rounded-lg border bg-card p-4">
          <h1 className="text-xl font-semibold">
            {currentTarget ? stepLabel(currentTarget, index) : t("presentations.missingStep")}
          </h1>
          {source && <div className="mt-3 space-y-2 rounded-md border p-3" aria-label={linkText("preview")}>
            <p className="text-xs font-medium" role="status">{sourcePreviews.error ? linkText("previewFailed") : sourcePreview ? linkText(sourceReviewStatus(source, sourcePreview)) : linkText("checkingSources")}</p>
            {sourcePreview?.snapshot && <p className="max-h-36 overflow-y-auto whitespace-pre-wrap break-words text-xs">{sourcePreview.snapshot.text || linkText("emptyPreview")}{sourcePreview.snapshot.truncated ? "…" : ""}</p>}
            <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void openSource()}>{linkText("presenterSource")}</Button><Button size="sm" variant="ghost" onClick={sourcePreviews.refresh}>{linkText("refreshSources")}</Button></div>
          </div>}
          {!currentStep && <p className="mt-4 text-sm text-muted-foreground">{t("presentations.noNotes")}</p>}
          {currentStep && <><textarea className="mt-3 min-h-28 w-full rounded-md border p-3 text-base" disabled={!editable} aria-label={t("presentations.speakerNotes")} value={notesValue} maxLength={5000} onChange={(event) => updateNotes(event.target.value)} onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
              event.preventDefault(); if (event.shiftKey) undo.current?.redo(); else undo.current?.undo();
            }
          }} /><Button type="button" className="mt-2" size="sm" disabled={!editable || saving} onClick={() => void saveNotes()}>{studio("saveNotes")}</Button></>}
        </section>

        {nextStep && <section className="shrink-0 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          <span className="text-xs font-semibold tracking-wide uppercase">{t("presentations.nextStepPreview")}</span>
          <p className="mt-1">{nextTarget ? stepLabel(nextTarget, index + 1) : t("presentations.noNextStep")}</p>
        </section>}
      </main>

      <footer className="mt-6 flex items-center justify-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={index === 0} onClick={() => goTo(index - 1)}>
          <ChevronLeft className="size-4" />
          {t("presentations.previousStep")}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={index >= steps.length - 1} onClick={() => goTo(index + 1)}>
          {t("presentations.nextStep")}
          <ChevronRight className="size-4" />
        </Button>
      </footer>
    </div>
  );
}
