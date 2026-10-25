import {
  AudioTrack,
  ConnectionQualityIndicator,
  isTrackReference,
  LockLockedIcon,
  ParticipantName,
  ParticipantPlaceholder,
  ParticipantTile,
  ScreenShareIcon,
  TrackMutedIndicator,
  TrackReferenceOrPlaceholder,
  useEnsureTrackRef,
  useIsEncrypted,
  useMaybeLayoutContext,
  VideoTrack,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import * as React from 'react';
import { HideTileButton } from './HiddenTiles';
import { isEqualTrackRef } from './trackRefs';

// <ParticipantTile> plus a hide button. Passing children replaces the tile's default contents,
// so those are copied here from components-react 2.9.24.
export function GroupTile(props: { trackRef?: TrackReferenceOrPlaceholder }) {
  return (
    <ParticipantTile trackRef={props.trackRef}>
      <TileContents />
    </ParticipantTile>
  );
}

function TileContents() {
  const trackReference = useEnsureTrackRef();
  const isEncrypted = useIsEncrypted(trackReference.participant);
  const layoutContext = useMaybeLayoutContext();

  const handleSubscribe = React.useCallback(
    (subscribed: boolean) => {
      if (
        !subscribed &&
        layoutContext?.pin.dispatch &&
        layoutContext.pin.state?.some((pinned) => isEqualTrackRef(pinned, trackReference))
      ) {
        layoutContext.pin.dispatch({ msg: 'clear_pin' });
      }
    },
    [trackReference, layoutContext],
  );

  return (
    <>
      {isTrackReference(trackReference) &&
      (trackReference.publication?.kind === 'video' ||
        trackReference.source === Track.Source.Camera ||
        trackReference.source === Track.Source.ScreenShare) ? (
        <VideoTrack trackRef={trackReference} onSubscriptionStatusChanged={handleSubscribe} />
      ) : (
        isTrackReference(trackReference) && (
          <AudioTrack trackRef={trackReference} onSubscriptionStatusChanged={handleSubscribe} />
        )
      )}
      <div className="lk-participant-placeholder">
        <ParticipantPlaceholder />
      </div>
      <div className="lk-participant-metadata">
        <div className="lk-participant-metadata-item">
          {trackReference.source === Track.Source.Camera ? (
            <>
              {isEncrypted && <LockLockedIcon style={{ marginRight: '0.25rem' }} />}
              <TrackMutedIndicator
                trackRef={{
                  participant: trackReference.participant,
                  source: Track.Source.Microphone,
                }}
                show={'muted'}
              ></TrackMutedIndicator>
              <ParticipantName />
            </>
          ) : (
            <>
              <ScreenShareIcon style={{ marginRight: '0.25rem' }} />
              <ParticipantName>&apos;s screen</ParticipantName>
            </>
          )}
        </div>
        <ConnectionQualityIndicator className="lk-participant-metadata-item" />
      </div>
      <HideTileButton trackRef={trackReference} />
    </>
  );
}
