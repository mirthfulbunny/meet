import {
  TrackReferenceOrPlaceholder,
  useParticipantTracks,
  useRoomContext,
  useTracks,
} from '@livekit/components-react';
import { Participant, ParticipantKind, RemoteAudioTrack, RoomEvent, Track } from 'livekit-client';
import * as React from 'react';
import { BarMenu } from './BarMenu';

// Per-viewer playback volume, saved in localStorage for all rooms (a friend's loudness doesn't
// depend on the room). Each remote participant has two channels: "voice" is every audio track
// except screen-share audio (mic, and an OBS ingress participant's audio), "stream" is
// screen-share audio. Capped at 100%: going above needs `webAudioMix`, which we don't use.
// Identities are stable across rejoins (cookie suffix in Meet, `-obs` for ingress).

export type Channel = 'voice' | 'stream';
type Setting = { volume: number; muted: boolean };

export type Volumes = {
  get: (identity: string, channel: Channel) => Setting;
  set: (identity: string, channel: Channel, patch: Partial<Setting>) => void;
};

const STORAGE_KEY = 'volumes';
const DEFAULT: Setting = { volume: 1, muted: false };
const AUDIO_SOURCES = [
  Track.Source.Microphone,
  Track.Source.ScreenShareAudio,
  Track.Source.Unknown,
];

const VolumesContext = React.createContext<Volumes | undefined>(undefined);
export const VolumesProvider = VolumesContext.Provider;

function channelOf(source: Track.Source): Channel {
  return source === Track.Source.ScreenShareAudio ? 'stream' : 'voice';
}

function volumeKey(identity: string, channel: Channel) {
  return `${identity}|${channel}`;
}

function load(): Record<string, Setting> {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (stored && typeof stored === 'object') {
      return stored;
    }
  } catch {}
  return {};
}

export function useVolumesState(): Volumes {
  // Only non-default settings are stored, so the map doesn't grow with every visitor.
  const [state, setState] = React.useState(load);
  const room = useRoomContext();

  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  // The volume sticks to the track object (and is applied when it's attached), so new
  // subscriptions, including a rejoining participant's, need setting again.
  React.useEffect(() => {
    const sync = () => {
      room.remoteParticipants.forEach((participant) => {
        participant.audioTrackPublications.forEach((publication) => {
          const setting = state[volumeKey(participant.identity, channelOf(publication.source))];
          if (publication.track instanceof RemoteAudioTrack) {
            publication.track.setVolume(setting?.muted ? 0 : (setting?.volume ?? 1));
          }
        });
      });
    };
    sync();
    const events = [RoomEvent.Connected, RoomEvent.Reconnected, RoomEvent.TrackSubscribed] as const;
    events.forEach((event) => room.on(event, sync));
    return () => {
      events.forEach((event) => room.off(event, sync));
    };
  }, [room, state]);

  return React.useMemo(
    () => ({
      get: (identity, channel) => state[volumeKey(identity, channel)] ?? DEFAULT,
      set: (identity, channel, patch) =>
        setState((s) => {
          const key = volumeKey(identity, channel);
          const next = { ...(s[key] ?? DEFAULT), ...patch };
          const { [key]: _old, ...rest } = s;
          return next.volume === 1 && !next.muted ? rest : { ...rest, [key]: next };
        }),
    }),
    [state],
  );
}

function SpeakerIcon(props: { muted?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      {props.muted ? (
        <path d="m22 9-6 6M16 9l6 6" />
      ) : (
        <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
      )}
    </svg>
  );
}

// Mute toggle, slider and percentage. Moving the slider unmutes.
function VolumeSlider(props: { identity: string; channel: Channel; label: string }) {
  const volumes = React.useContext(VolumesContext);
  if (!volumes) {
    return null;
  }
  const { volume, muted } = volumes.get(props.identity, props.channel);
  const percent = Math.round(volume * 100);
  return (
    <div className="volume-slider">
      <button
        className="lk-button"
        title={muted ? `Unmute ${props.label}` : `Mute ${props.label} (only for you)`}
        aria-label={muted ? `Unmute ${props.label}` : `Mute ${props.label}`}
        aria-pressed={muted}
        onClick={() => volumes.set(props.identity, props.channel, { muted: !muted })}
      >
        <SpeakerIcon muted={muted || volume === 0} />
      </button>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={percent}
        aria-label={`${props.label} volume`}
        className={muted ? 'volume-slider-muted' : undefined}
        onChange={(e) =>
          volumes.set(props.identity, props.channel, {
            volume: Number(e.target.value) / 100,
            muted: false,
          })
        }
      />
      <span className="volume-slider-value">{muted ? 'Muted' : `${percent}%`}</span>
    </div>
  );
}

function hasChannel(trackRefs: { source: Track.Source }[], channel: Channel) {
  return trackRefs.some((trackRef) => channelOf(trackRef.source) === channel);
}

function channelLabel(participant: Participant, channel: Channel) {
  const name = participant.name || participant.identity;
  return channel === 'stream' ? `${name}'s screen audio` : name;
}

// Speaker button on a tile: the camera tile controls the voice channel, the screen-share tile
// controls screen-share audio. Only shown when that channel has a track.
export function TileVolumeButton(props: { trackRef: TrackReferenceOrPlaceholder }) {
  const volumes = React.useContext(VolumesContext);
  const { participant } = props.trackRef;
  const audioTracks = useParticipantTracks(AUDIO_SOURCES, participant.identity);
  const channel = props.trackRef.source === Track.Source.ScreenShare ? 'stream' : 'voice';
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    const onMouseDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  if (!volumes || participant.isLocal || !hasChannel(audioTracks, channel)) {
    return null;
  }
  const { volume, muted } = volumes.get(participant.identity, channel);
  const label = channelLabel(participant, channel);
  return (
    <div ref={ref} className="tile-volume" onClick={(e) => e.stopPropagation()}>
      <button
        className={`lk-button lk-focus-toggle-button${open ? ' tile-volume-open' : ''}`}
        title={`Volume: ${label}`}
        aria-label={`Volume: ${label}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <SpeakerIcon muted={muted || volume === 0} />
      </button>
      {open && (
        <div className="tile-volume-popup">
          <VolumeSlider identity={participant.identity} channel={channel} label={label} />
        </div>
      )}
    </div>
  );
}

export function VolumeMenu(props: { showText: boolean }) {
  const volumes = React.useContext(VolumesContext);
  const audioTracks = useTracks(AUDIO_SOURCES, { onlySubscribed: false }).filter(
    (trackRef) => !trackRef.participant.isLocal,
  );

  if (!volumes) {
    return null;
  }

  const participants = new Map<string, { participant: Participant; channels: Set<Channel> }>();
  audioTracks.forEach(({ participant, source }) => {
    const entry = participants.get(participant.identity) ?? {
      participant,
      channels: new Set<Channel>(),
    };
    entry.channels.add(channelOf(source));
    participants.set(participant.identity, entry);
  });
  const rows = [...participants.values()].sort((a, b) =>
    (a.participant.name || a.participant.identity).localeCompare(
      b.participant.name || b.participant.identity,
    ),
  );

  return (
    <BarMenu
      title="Volume"
      buttonContent={
        <>
          <SpeakerIcon />
          {props.showText && 'Volume'}
        </>
      }
    >
      {rows.length === 0 ? (
        <div className="bar-menu-note">No one else has audio.</div>
      ) : (
        rows.map(({ participant, channels }) => (
          <React.Fragment key={participant.identity}>
            <div className="bar-menu-heading">{participant.name || participant.identity}</div>
            {(['voice', 'stream'] as const)
              .filter((channel) => channels.has(channel))
              .map((channel) => (
                <div className="bar-menu-row bar-menu-row-spread" key={channel}>
                  <span>
                    {channel === 'stream'
                      ? 'Screen audio'
                      : participant.kind === ParticipantKind.INGRESS
                        ? 'Audio'
                        : 'Voice'}
                  </span>
                  <VolumeSlider
                    identity={participant.identity}
                    channel={channel}
                    label={channelLabel(participant, channel)}
                  />
                </div>
              ))}
          </React.Fragment>
        ))
      )}
    </BarMenu>
  );
}
