import {
  isTrackReference,
  TrackReferenceOrPlaceholder,
  useParticipants,
  useRoomContext,
} from '@livekit/components-react';
import { RoomEvent, Track } from 'livekit-client';
import * as React from 'react';

// Per-viewer tile hiding, saved in localStorage per room. A tile is one participant + source
// (camera or screen share), so a screen share can be hidden without hiding the camera. Hidden
// remote video is unsubscribed, which also stops it using downlink. Audio is left alone.
// Identities are stable across rejoins: Meet keeps the random suffix in a cookie.

type Stored = { hidden: string[]; hideNoVideo: boolean };

export type HiddenTiles = Stored & {
  isVisible: (trackRef: TrackReferenceOrPlaceholder) => boolean;
  hide: (trackRef: TrackReferenceOrPlaceholder) => void;
  unhide: (key: string) => void;
  setHideNoVideo: (hideNoVideo: boolean) => void;
};

const HiddenTilesContext = React.createContext<HiddenTiles | undefined>(undefined);
export const HiddenTilesProvider = HiddenTilesContext.Provider;

function tileKey(identity: string, source: Track.Source) {
  return `${identity}|${source}`;
}

function splitTileKey(key: string): [string, string] {
  const i = key.lastIndexOf('|');
  return [key.slice(0, i), key.slice(i + 1)];
}

function hasVideo(trackRef: TrackReferenceOrPlaceholder) {
  return isTrackReference(trackRef) && !trackRef.publication.isMuted;
}

function load(storageKey: string): Stored {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (stored) {
      return {
        hidden: Array.isArray(stored.hidden) ? stored.hidden : [],
        hideNoVideo: !!stored.hideNoVideo,
      };
    }
  } catch {}
  return { hidden: [], hideNoVideo: false };
}

export function useHiddenTilesState(roomName: string): HiddenTiles {
  const storageKey = `hidden-tiles:${roomName}`;
  const [state, setState] = React.useState(() => load(storageKey));
  const room = useRoomContext();

  React.useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {}
  }, [storageKey, state]);

  // autoSubscribe is on, so newly published tracks need unsubscribing again if hidden.
  React.useEffect(() => {
    const hidden = new Set(state.hidden);
    const sync = () => {
      room.remoteParticipants.forEach((participant) => {
        participant.videoTrackPublications.forEach((publication) => {
          const wanted = !hidden.has(tileKey(participant.identity, publication.source));
          if (publication.isDesired !== wanted) {
            publication.setSubscribed(wanted);
          }
        });
      });
    };
    sync();
    const events = [
      RoomEvent.Connected,
      RoomEvent.Reconnected,
      RoomEvent.ParticipantConnected,
      RoomEvent.TrackPublished,
    ] as const;
    events.forEach((event) => room.on(event, sync));
    return () => {
      events.forEach((event) => room.off(event, sync));
    };
  }, [room, state.hidden]);

  return React.useMemo(() => {
    const hidden = new Set(state.hidden);
    return {
      ...state,
      isVisible: (trackRef) =>
        !hidden.has(tileKey(trackRef.participant.identity, trackRef.source)) &&
        !(state.hideNoVideo && trackRef.source === Track.Source.Camera && !hasVideo(trackRef)),
      hide: (trackRef) => {
        const key = tileKey(trackRef.participant.identity, trackRef.source);
        setState((s) => (s.hidden.includes(key) ? s : { ...s, hidden: [...s.hidden, key] }));
      },
      unhide: (key) => setState((s) => ({ ...s, hidden: s.hidden.filter((k) => k !== key) })),
      setHideNoVideo: (hideNoVideo) => setState((s) => ({ ...s, hideNoVideo })),
    };
  }, [state]);
}

function EyeOffIcon() {
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
      <path d="M10.7 5.1A10.4 10.4 0 0 1 12 5c7 0 10 7 10 7a13.2 13.2 0 0 1-1.7 2.7" />
      <path d="M6.6 6.6A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m2 2 20 20" />
    </svg>
  );
}

export function HideTileButton(props: { trackRef: TrackReferenceOrPlaceholder }) {
  const hiddenTiles = React.useContext(HiddenTilesContext);
  if (!hiddenTiles) {
    return null;
  }
  return (
    <button
      className="lk-button lk-focus-toggle-button hide-tile-button"
      title="Hide (only for you)"
      aria-label="Hide (only for you)"
      onClick={(e) => {
        e.stopPropagation();
        hiddenTiles.hide(props.trackRef);
      }}
    >
      <EyeOffIcon />
    </button>
  );
}

export function HiddenTilesMenu() {
  const hiddenTiles = React.useContext(HiddenTilesContext);
  const participants = useParticipants();
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

  if (!hiddenTiles) {
    return null;
  }

  const label = (key: string) => {
    const [identity, source] = splitTileKey(key);
    const name =
      participants.find((p) => p.identity === identity)?.name || identity.replace(/__[^_]*$/, '');
    return source === Track.Source.ScreenShare ? `${name}'s screen` : name;
  };

  return (
    <div ref={ref} className="hidden-tiles-menu">
      {open && (
        <div className="hidden-tiles-popup">
          <label className="hidden-tiles-row">
            <input
              type="checkbox"
              checked={hiddenTiles.hideNoVideo}
              onChange={(e) => hiddenTiles.setHideNoVideo(e.target.checked)}
            />
            Hide people without video
          </label>
          {hiddenTiles.hidden.length === 0 ? (
            <div className="hidden-tiles-empty">Nothing hidden. Hover a tile to hide it.</div>
          ) : (
            hiddenTiles.hidden.map((key) => (
              <div className="hidden-tiles-row" key={key}>
                <span>{label(key)}</span>
                <button className="lk-button" onClick={() => hiddenTiles.unhide(key)}>
                  Show
                </button>
              </div>
            ))
          )}
        </div>
      )}
      <button className="lk-button" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <EyeOffIcon />
        Hidden ({hiddenTiles.hidden.length})
      </button>
    </div>
  );
}
