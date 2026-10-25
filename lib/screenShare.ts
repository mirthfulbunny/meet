import { useRoomContext } from '@livekit/components-react';
import {
  LocalParticipant,
  LocalVideoTrack,
  ScreenShareCaptureOptions,
  Track,
  TrackPublishOptions,
  VideoCodec,
} from 'livekit-client';
import * as React from 'react';
import toast from 'react-hot-toast';

// Screen-share quality and encoder, chosen in the control bar and saved per viewer.
// Changing them mid-share re-publishes the running capture (no new window picker): the
// capture is rescaled with applyConstraints, then unpublished and published again with the
// new codec/bitrate. If that fails the share is stopped rather than left on old settings.

export const QUALITIES = {
  '720p60': {
    label: '720p60',
    resolution: { width: 1280, height: 720, frameRate: 60 },
    maxBitrate: 6_000_000,
  },
  '1080p60': {
    label: '1080p60',
    resolution: { width: 1920, height: 1080, frameRate: 60 },
    maxBitrate: 10_000_000,
  },
} as const;

export const ENCODERS = {
  gpu: { label: 'GPU (H.264)', codec: 'h264' },
  cpu: { label: 'CPU (VP9)', codec: 'vp9' },
} as const satisfies Record<string, { label: string; codec: VideoCodec }>;

export type ScreenShareSettings = {
  quality: keyof typeof QUALITIES;
  encoder: keyof typeof ENCODERS;
};

const STORAGE_KEY = 'screen-share-settings';

function load(): ScreenShareSettings {
  // ?codec= in the room URL only picks the starting encoder; a saved choice wins.
  const codec = new URLSearchParams(window.location.search).get('codec');
  const settings: ScreenShareSettings = {
    quality: '720p60',
    encoder: codec === 'vp9' ? 'cpu' : 'gpu',
  };
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (stored?.quality in QUALITIES) {
      settings.quality = stored.quality;
    }
    if (stored?.encoder in ENCODERS) {
      settings.encoder = stored.encoder;
    }
  } catch {}
  return settings;
}

export function captureOptionsFor(settings: ScreenShareSettings): ScreenShareCaptureOptions {
  return {
    // audio: true keeps system audio; selfBrowserSurface matches the stock control bar.
    audio: true,
    selfBrowserSurface: 'include',
    resolution: QUALITIES[settings.quality].resolution,
    contentHint: 'motion',
  };
}

export function publishOptionsFor(
  settings: ScreenShareSettings,
  e2eeEnabled: boolean,
): TrackPublishOptions {
  const codec: VideoCodec = ENCODERS[settings.encoder].codec;
  return {
    // Same rule as PageClientImpl's room options: no VP9/AV1 with E2EE.
    videoCodec: e2eeEnabled && codec === 'vp9' ? undefined : codec,
    screenShareEncoding: { maxBitrate: QUALITIES[settings.quality].maxBitrate, maxFramerate: 60 },
  };
}

async function stopScreenShare(participant: LocalParticipant, track: LocalVideoTrack) {
  try {
    track.stop();
    if (participant.getTrackPublication(Track.Source.ScreenShare)) {
      await participant.unpublishTrack(track);
    }
    const audio = participant.getTrackPublication(Track.Source.ScreenShareAudio)?.track;
    if (audio) {
      await participant.unpublishTrack(audio);
    }
  } catch (e) {
    console.error(e);
  }
}

export function useScreenShareSettings() {
  const room = useRoomContext();
  const [settings, setSettings] = React.useState(load);
  const [applying, setApplying] = React.useState(false);

  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {}
  }, [settings]);

  const update = React.useCallback(
    async (next: ScreenShareSettings) => {
      setSettings(next);
      const participant = room.localParticipant;
      const track = participant.getTrackPublication(Track.Source.ScreenShare)?.track;
      if (!(track instanceof LocalVideoTrack)) {
        return;
      }
      setApplying(true);
      try {
        const { width, height, frameRate } = QUALITIES[next.quality].resolution;
        await track.mediaStreamTrack.applyConstraints({
          width: { ideal: width },
          height: { ideal: height },
          frameRate,
        });
        await participant.unpublishTrack(track, false);
        await participant.publishTrack(track, {
          source: Track.Source.ScreenShare,
          ...publishOptionsFor(next, room.isE2EEEnabled),
        });
      } catch (e) {
        console.error(e);
        await stopScreenShare(participant, track);
        toast("Couldn't apply the new settings to your share. Start sharing again.", {
          duration: 5000,
          position: 'top-center',
          className: 'lk-button',
          style: { backgroundColor: 'var(--lk-danger3)', color: 'var(--lk-fg)' },
        });
      } finally {
        setApplying(false);
      }
    },
    [room],
  );

  return { settings, update, applying };
}
