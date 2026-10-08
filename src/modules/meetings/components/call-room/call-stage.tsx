"use client";

import { useState } from "react";
import {
  CarouselLayout,
  Chat,
  ConnectionStateToast,
  ControlBar,
  FocusLayout,
  GridLayout,
  isTrackReference,
  LayoutContextProvider,
  ParticipantTile,
  RoomAudioRenderer,
  useCreateLayoutContext,
  usePinnedTracks,
  useTracks,
  type TrackReferenceOrPlaceholder,
  type WidgetState,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { RecordingIndicator } from "./recording-indicator";

/** Each participant has at most one camera and one screen share. */
const sameTrack = (a: TrackReferenceOrPlaceholder, b: TrackReferenceOrPlaceholder) =>
  a.participant.identity === b.participant.identity && a.source === b.source;

/**
 * LiveKit's VideoConference, trimmed to what we need and with one change: a
 * shared screen (or a pinned tile) takes the main area while every person
 * stays visible in a column beside it (a row below on narrow screens). The
 * stock layout squeezed the others into a sixth of the width.
 */
export function CallStage({ record }: { record: boolean }) {
  const [widget, setWidget] = useState<WidgetState>({ showChat: false, unreadMessages: 0, showSettings: false });
  const layoutContext = useCreateLayoutContext();
  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }, { source: Track.Source.ScreenShare, withPlaceholder: false }],
    { onlySubscribed: false },
  );
  const pinned = usePinnedTracks(layoutContext)[0];
  const shares = tracks.filter(isTrackReference).filter((track) => track.source === Track.Source.ScreenShare);
  // A pin set by a person wins; otherwise someone else's screen before one's own.
  const focus = (pinned && tracks.find((track) => sameTrack(track, pinned)))
    ?? shares.find((track) => !track.participant.isLocal) ?? shares[0];
  const others = focus ? tracks.filter((track) => !sameTrack(track, focus)) : tracks;

  return (
    <div className="lk-video-conference">
      <LayoutContextProvider value={layoutContext} onWidgetChange={setWidget}>
        <div className="lk-video-conference-inner">
          <div className="relative flex min-h-0 w-full flex-1 flex-col">
            {focus ? (
              <div className="flex h-full min-h-0 flex-col gap-2 p-2 md:flex-row">
                <FocusLayout trackRef={focus} className="min-h-0 min-w-0 flex-1" />
                {others.length > 0 && (
                  // The className replaces LiveKit's own, so "lk-carousel" stays in it.
                  <CarouselLayout tracks={others} className="lk-carousel h-28 shrink-0 md:h-full md:w-64">
                    <ParticipantTile />
                  </CarouselLayout>
                )}
              </div>
            ) : (
              <GridLayout tracks={tracks}>
                <ParticipantTile />
              </GridLayout>
            )}
            {/* Repeats the header's indicator where people look; announced only once. */}
            {record && <div className="pointer-events-none absolute top-3 left-3 z-10" aria-hidden><RecordingIndicator className="shadow" /></div>}
          </div>
          <ControlBar controls={{ chat: true, settings: false }} />
        </div>
        <Chat style={{ display: widget.showChat ? "grid" : "none" }} />
      </LayoutContextProvider>
      <RoomAudioRenderer />
      <ConnectionStateToast />
    </div>
  );
}
