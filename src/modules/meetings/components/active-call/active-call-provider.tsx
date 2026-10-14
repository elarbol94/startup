"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { callPath, type ActiveCall, type EndedCall, type JoinedCall } from "./active-call-types";
import { EndedCallDock } from "./ended-call-dock";

// LiveKit (client and styles) loads only once this tab joins a call, not with every page.
const ActiveCallRoom = dynamic(() => import("./active-call-room").then((module) => module.ActiveCallRoom), { ssr: false });

type ActiveCallContext = {
  call: ActiveCall | null;
  ended: EndedCall | null;
  deviceWarning: boolean;
  /** Enters a call (replacing any other one this tab is in). */
  enter: (meetingId: string, title: string, joined: JoinedCall) => void;
  dismissEnded: () => void;
  /** The call page's stage element; while it is mounted the call renders there, otherwise in the dock. */
  setStage: (element: HTMLElement | null) => void;
};

const Context = createContext<ActiveCallContext | null>(null);

export function useActiveCall() {
  const value = useContext(Context);
  if (!value) throw new Error("useActiveCall needs ActiveCallProvider");
  return value;
}

/**
 * Keeps the tab's call connected while the person moves around the platform.
 * It sits in the app layout, which Next.js keeps mounted across client-side
 * navigation: on the call page the full stage is portalled into the page, on
 * every other page a small dock stays in the corner. A full page load (or
 * closing the tab) still leaves the call.
 *
 * Once a connection ends nothing reconnects on its own: an auto-reconnect
 * with an old token would loop against a closed room.
 */
export function ActiveCallProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [call, setCall] = useState<ActiveCall | null>(null);
  const [ended, setEnded] = useState<EndedCall | null>(null);
  const [deviceWarning, setDeviceWarning] = useState(false);
  const [stage, setStageElement] = useState<HTMLElement | null>(null);
  // The room that is current right now; a disconnect from a replaced or unmounted room is ignored.
  const current = useRef<ActiveCall | null>(null);
  const attempts = useRef(0);

  const finish = useCallback((key: string, result: Omit<EndedCall, "meetingId" | "title">) => {
    const active = current.current;
    if (!active || active.key !== key) return;
    current.current = null;
    setCall(null);
    setDeviceWarning(false);
    setEnded({ meetingId: active.meetingId, title: active.title, ...result });
  }, []);

  const enter = useCallback((meetingId: string, title: string, joined: JoinedCall) => {
    attempts.current += 1;
    const next = { key: `${meetingId}:${attempts.current}`, meetingId, title, joined };
    current.current = next;
    setCall(next);
    setEnded(null);
    setDeviceWarning(false);
  }, []);

  const dismissEnded = useCallback(() => setEnded(null), []);
  const setStage = useCallback((element: HTMLElement | null) => setStageElement(element), []);

  const value = useMemo(() => ({ call, ended, deviceWarning, enter, dismissEnded, setStage }), [call, ended, deviceWarning, enter, dismissEnded, setStage]);
  const onCallPage = (meetingId: string) => pathname === callPath(meetingId);

  return (
    <Context.Provider value={value}>
      {children}
      {call && (
        <ActiveCallRoom
          key={call.key}
          call={call}
          stage={stage && onCallPage(call.meetingId) ? stage : null}
          deviceWarning={deviceWarning}
          onDeviceWarning={setDeviceWarning}
          onEnd={finish}
        />
      )}
      {!call && ended && !onCallPage(ended.meetingId) && <EndedCallDock ended={ended} onDismiss={dismissEnded} />}
    </Context.Provider>
  );
}
