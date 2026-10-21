"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { PresentationScene } from "./presentation-scene";
import {
  presentationStopBounds, presentationStopHeading, presentationElementCaption, presentationSceneElements, presentationScenePosition,
  presentationStops, sceneOfStop, stepPresentationPosition, stepTarget, type PresentationPosition,
} from "../lib/presentation";
import { formatElapsed, formatRemaining, parsePresenterMessage, presenterChannelName } from "../lib/presenter";
import { CollaborationContext, CollaborationStatus, useCollaboration, useCollaborationContext } from "../collaboration/ui";
import * as Y from "yjs";
import { LOCAL, patchPresentation, presentationJSON } from "../collaboration/codec";
import type { PresentationRecord } from "../presentation-queries";

const subscribeHydration = () => () => {};
/** How long a presenter window opened from a player waits for its first "where are we". */
const SYNC_WAIT_MS = 1500;

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
  // The player counts stops, which include detail pages without steps of their own.
  const elements = snapshot.elements;
  const stops = useMemo(() => presentationStops(elements, snapshot.steps), [elements, snapshot.steps]);
  const presentation = { ...initial, ...snapshot, steps: stops.map((stop) => stop.step) };
  const t = useTranslations("wiki");
  const studio = useTranslations("presentationStudio");
  const hydrated = useSyncExternalStore(subscribeHydration, () => true, () => false);
  const { steps } = presentation;
  // Where the player stands, detail pages to come back out of included: prev/next take the
  // player's own path (into a detail page and out again), not the flat list of stops.
  const [position, setPosition] = useState<PresentationPosition>(() => ({ index: Math.max(stops.findIndex((stop) => stop.sceneId === null), 0), returns: [] }));
  const index = position.index;
  // Opened from a player, this window shows nothing of its own until the player says where it
  // is, rather than stop 1 for a moment; a player that never answers is given up on shortly.
  const [synced, setSynced] = useState(!sessionId);
  useEffect(() => {
    if (synced) return;
    const timer = setTimeout(() => setSynced(true), SYNC_WAIT_MS);
    return () => clearTimeout(timer);
  }, [synced]);
  const [elapsedMs, setElapsedMs] = useState(0);
  // The talk's planned length, remembered per presentation on this device: the timer then
  // counts down to it as well and turns red once the talk runs over.
  const targetKey = `wiki-presentation-target:${initial.id}`;
  const [targetMinutes, setTargetMinutes] = useState<number | null>(() => {
    try { const stored = Number(window.localStorage.getItem(targetKey)); return stored > 0 ? stored : null; } catch { return null; }
  });
  const changeTarget = (raw: string) => {
    const minutes = Math.min(Math.max(Math.round(Number(raw)), 0), 600);
    const next = Number.isFinite(minutes) && minutes > 0 ? minutes : null;
    setTargetMinutes(next);
    try { if (next) window.localStorage.setItem(targetKey, String(next)); else window.localStorage.removeItem(targetKey); } catch { /* private window: kept for this session only */ }
  };
  const overrun = targetMinutes !== null && elapsedMs > targetMinutes * 60_000;
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
    const clamp = (at: number) => Math.min(Math.max(at, 0), Math.max(steps.length - 1, 0));
    channel.onmessage = (event) => {
      const message = parsePresenterMessage(event.data);
      if (message?.type === "step") {
        setPosition({ index: clamp(message.index), returns: (message.returns ?? []).map(clamp) });
        setSynced(true);
      }
    };
    // The player may already be several steps in by the time this window opens.
    channel.postMessage({ type: "request-step" });
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [presentation.id, sessionId, steps.length]);

  // Shown at once; a player that cannot take the move (a card turn is running) answers
  // with where it really is, which puts this window back.
  const goTo = useCallback((next: PresentationPosition) => {
    setPosition(next);
    channelRef.current?.postMessage({ type: "goto", index: next.index, returns: next.returns });
  }, []);
  const previous = stepPresentationPosition(elements, stops, position, -1);
  const following = stepPresentationPosition(elements, stops, position, 1);
  const hasPrevious = synced && previous.index !== index, hasNext = synced && following.index !== index;

  // The presenter often looks at this window, and a clicker sends its keys to whichever
  // window has focus: the same keys as the player's, steering it from here.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === " " && target?.closest("button, a, [role='button']")) return;
      if (event.key === "ArrowRight" || event.key === " " || event.key === "PageDown") {
        event.preventDefault();
        if (hasNext) goTo(following);
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        if (hasPrevious) goTo(previous);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goTo, hasNext, hasPrevious, following, previous]);

  const currentStop = stops[index] ?? null;
  const currentStep = currentStop?.step ?? null;
  const currentTarget = currentStep ? stepTarget(currentStep, elements) : null;
  const nextStep = hasNext ? stops[following.index].step : null;
  const nextTarget = nextStep ? stepTarget(nextStep, elements) : null;
  const scenePosition = presentationScenePosition(stops, index);
  const sceneFrame = currentStop?.sceneId ? elements.find((element) => element.id === currentStop.sceneId) : undefined;
  const sceneCaption = sceneFrame ? presentationElementCaption(sceneFrame) || t("presentations.details.group") : null;
  // What the audience sees at a stop: its own scene, framed like the player frames it.
  const preview = (at: number) => <PresentationScene presentation={{ ...presentation, elements: presentationSceneElements(elements, sceneOfStop(stops, at)) }} index={at} bounds={presentationStopBounds(elements, stops, at)} />;
  // A detail page without a stop of its own shows a stop made up for it: no step to keep notes on.
  const notesStored = currentStop?.stepIndex !== null;
  const notesValue = currentStep?.notes ?? "";
  const editable = hydrated && notesStored && collaboration.status !== "denied" && collaboration.status !== "error";
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
          {/* Counted like the player's control bar: within the open scene. */}
          <p className="text-xs text-muted-foreground" data-testid="presenter-position">
            {!synced ? "…" : steps.length ? `${sceneCaption ? `${sceneCaption} · ` : ""}${scenePosition.current} / ${scenePosition.total}` : t("presentations.noSteps")}
          </p>
          {/* The talk's planned length, beside the position rather than with the timer's
              buttons, which notifications in the top corner would otherwise cover. */}
          <div className="mt-1 flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
            <label className="flex items-center gap-1">
              {studio("targetMinutes")}
              <input type="number" min={0} max={600} step={1} inputMode="numeric" className="h-6 w-14 rounded-md border bg-transparent px-1.5 text-xs" disabled={!hydrated}
                value={targetMinutes ?? ""} onChange={(event) => changeTarget(event.target.value)} />
            </label>
            {targetMinutes !== null && <span data-testid="presenter-remaining" className={overrun ? "font-semibold text-destructive" : undefined} title={studio("remainingTime")}>
              ({formatRemaining(targetMinutes * 60_000, elapsedMs)})
            </span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-sm tabular-nums text-muted-foreground">
          <Clock className="size-4" />
          <span role="timer">{formatElapsed(elapsedMs)}</span>
          <Button type="button" size="sm" variant="outline" disabled={!hydrated} onClick={() => setRunning(!running)}>{running ? studio("pauseTimer") : studio("resumeTimer")}</Button>
          <Button type="button" size="sm" variant="outline" disabled={!hydrated} onClick={() => setElapsedMs(0)}>{studio("resetTimer")}</Button>
        </div>
      </header>

      <CollaborationStatus provider={collaboration} />
      {!synced ? <main className="mt-6 flex min-h-0 flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground" role="status">{t("presentations.presenterConnecting")}</p>
      </main> : <main className="mt-6 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        <div className="grid shrink-0 grid-cols-[2fr_1fr] gap-3 sm:gap-4">
          <section className="min-w-0"><h2 className="mb-2 text-sm font-medium">{studio("currentPreview")}</h2><div className="h-[22dvh] min-h-28 overflow-hidden rounded-md border sm:h-[32dvh]">{currentStop && preview(index)}</div></section>
          <section className="min-w-0"><h2 className="mb-2 text-sm font-medium">{studio("nextPreview")}</h2><div className="h-[22dvh] min-h-28 overflow-hidden rounded-md border sm:h-[32dvh]">{nextStep ? preview(following.index) : <p className="p-4 text-sm text-muted-foreground">{t("presentations.noNextStep")}</p>}</div></section>
        </div>
        <section className="min-h-56 shrink-0 flex-1 rounded-lg border bg-card p-4">
          <h1 className="text-xl font-semibold">
            {currentTarget ? presentationStopHeading(elements, currentTarget, index) : t("presentations.missingStep")}
          </h1>
          {!currentStep && <p className="mt-4 text-sm text-muted-foreground">{t("presentations.noNotes")}</p>}
          {currentStep && <><textarea className="mt-3 min-h-28 w-full rounded-md border p-3 text-base" disabled={!editable} aria-label={t("presentations.speakerNotes")} value={notesValue} maxLength={5000} onChange={(event) => updateNotes(event.target.value)} onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
              event.preventDefault(); if (event.shiftKey) undo.current?.redo(); else undo.current?.undo();
            }
          }} />{!notesStored && <p className="mt-2 text-sm text-muted-foreground">{t("presentations.detailNotesUnavailable")}</p>}<Button type="button" className="mt-2" size="sm" disabled={!editable || saving} onClick={() => void saveNotes()}>{studio("saveNotes")}</Button></>}
        </section>

        {nextStep && <section className="shrink-0 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          <span className="text-xs font-semibold tracking-wide uppercase">{t("presentations.nextStepPreview")}</span>
          <p className="mt-1">{nextTarget ? presentationStopHeading(elements, nextTarget, following.index) : t("presentations.noNextStep")}</p>
        </section>}
      </main>}

      <footer className="mt-6 flex items-center justify-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={!hasPrevious} onClick={() => goTo(previous)}>
          <ChevronLeft className="size-4" />
          {t("presentations.previousStep")}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={!hasNext} onClick={() => goTo(following)}>
          {t("presentations.nextStep")}
          <ChevronRight className="size-4" />
        </Button>
      </footer>
    </div>
  );
}
