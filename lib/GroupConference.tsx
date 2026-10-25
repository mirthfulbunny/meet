import {
  CarouselLayout,
  Chat,
  ConnectionStateToast,
  ControlBar,
  FocusLayoutContainer,
  GridLayout,
  isTrackReference,
  LayoutContextProvider,
  MessageFormatter,
  RoomAudioRenderer,
  TrackReferenceOrPlaceholder,
  useCreateLayoutContext,
  usePinnedTracks,
  useTracks,
  WidgetState,
} from '@livekit/components-react';
import { RoomEvent, Track } from 'livekit-client';
import * as React from 'react';
import { GroupTile } from './GroupTile';
import { HiddenTilesMenu, HiddenTilesProvider, useHiddenTilesState } from './HiddenTiles';
import { isEqualTrackRef } from './trackRefs';

// Local copy of components-react 2.9.24's <VideoConference> prefab, so we own the tile list
// and the control bar. Changes from upstream: per-viewer tile hiding (see HiddenTiles.tsx).

export function GroupConference(props: {
  roomName: string;
  chatMessageFormatter?: MessageFormatter;
  SettingsComponent?: React.ComponentType;
}) {
  const { chatMessageFormatter, SettingsComponent } = props;
  const [widgetState, setWidgetState] = React.useState<WidgetState>({
    showChat: false,
    unreadMessages: 0,
    showSettings: false,
  });
  const lastAutoFocusedScreenShareTrack = React.useRef<TrackReferenceOrPlaceholder | null>(null);
  const hiddenTiles = useHiddenTilesState(props.roomName);

  const allTracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    {
      // Mute events added so "hide people without video" reacts to cameras turning on/off.
      updateOnlyOn: [RoomEvent.ActiveSpeakersChanged, RoomEvent.TrackMuted, RoomEvent.TrackUnmuted],
      onlySubscribed: false,
    },
  );
  const tracks = allTracks.filter(hiddenTiles.isVisible);

  const layoutContext = useCreateLayoutContext();

  const screenShareTracks = tracks
    .filter(isTrackReference)
    .filter((track) => track.publication.source === Track.Source.ScreenShare);

  const pinnedTrack = usePinnedTracks(layoutContext)?.[0];
  const focusTrack = pinnedTrack && hiddenTiles.isVisible(pinnedTrack) ? pinnedTrack : undefined;
  const carouselTracks = tracks.filter((track) => !isEqualTrackRef(track, focusTrack));

  React.useEffect(() => {
    if (pinnedTrack && !focusTrack) {
      layoutContext.pin.dispatch?.({ msg: 'clear_pin' });
    }
  }, [pinnedTrack, focusTrack]);

  React.useEffect(() => {
    // If screen share tracks are published, and no pin is set explicitly, auto set the screen share.
    if (
      screenShareTracks.some((track) => track.publication.isSubscribed) &&
      lastAutoFocusedScreenShareTrack.current === null
    ) {
      layoutContext.pin.dispatch?.({ msg: 'set_pin', trackReference: screenShareTracks[0] });
      lastAutoFocusedScreenShareTrack.current = screenShareTracks[0];
    } else if (
      lastAutoFocusedScreenShareTrack.current &&
      !screenShareTracks.some(
        (track) =>
          track.publication.trackSid ===
          lastAutoFocusedScreenShareTrack.current?.publication?.trackSid,
      )
    ) {
      layoutContext.pin.dispatch?.({ msg: 'clear_pin' });
      lastAutoFocusedScreenShareTrack.current = null;
    }
    if (focusTrack && !isTrackReference(focusTrack)) {
      const updatedFocusTrack = tracks.find(
        (tr) =>
          tr.participant.identity === focusTrack.participant.identity &&
          tr.source === focusTrack.source,
      );
      if (updatedFocusTrack !== focusTrack && isTrackReference(updatedFocusTrack)) {
        layoutContext.pin.dispatch?.({ msg: 'set_pin', trackReference: updatedFocusTrack });
      }
    }
  }, [
    screenShareTracks
      .map((ref) => `${ref.publication.trackSid}_${ref.publication.isSubscribed}`)
      .join(),
    focusTrack?.publication?.trackSid,
    allTracks,
    hiddenTiles,
  ]);

  return (
    <div className="lk-video-conference">
      <HiddenTilesProvider value={hiddenTiles}>
        <LayoutContextProvider value={layoutContext} onWidgetChange={setWidgetState}>
          <div className="lk-video-conference-inner">
            {!focusTrack ? (
              <div className="lk-grid-layout-wrapper">
                <GridLayout tracks={tracks}>
                  <GroupTile />
                </GridLayout>
              </div>
            ) : (
              <div className="lk-focus-layout-wrapper">
                <FocusLayoutContainer>
                  <CarouselLayout tracks={carouselTracks}>
                    <GroupTile />
                  </CarouselLayout>
                  <GroupTile trackRef={focusTrack} />
                </FocusLayoutContainer>
              </div>
            )}
            <ControlBar controls={{ chat: true, settings: !!SettingsComponent }} />
            {/* Floats over the bar's left edge until the custom control bar exists. */}
            <HiddenTilesMenu />
          </div>
          <Chat
            style={{ display: widgetState.showChat ? 'grid' : 'none' }}
            messageFormatter={chatMessageFormatter}
          />
          {SettingsComponent && (
            <div
              className="lk-settings-menu-modal"
              style={{ display: widgetState.showSettings ? 'block' : 'none' }}
            >
              <SettingsComponent />
            </div>
          )}
        </LayoutContextProvider>
      </HiddenTilesProvider>
      <RoomAudioRenderer />
      <ConnectionStateToast />
    </div>
  );
}
