import {
  ChatIcon,
  ChatToggle,
  DisconnectButton,
  GearIcon,
  LeaveIcon,
  MediaDeviceMenu,
  StartMediaButton,
  TrackToggle,
  useLocalParticipantPermissions,
  useMaybeLayoutContext,
  usePersistentUserChoices,
  useRoomContext,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import * as React from 'react';
import { BarMenu } from './BarMenu';
import { HiddenTilesMenu } from './HiddenTiles';
import {
  captureOptionsFor,
  ENCODERS,
  publishOptionsFor,
  QUALITIES,
  ScreenShareSettings,
  useScreenShareSettings,
} from './screenShare';
import { VolumeMenu } from './Volumes';

// Our control bar, based on components-react 2.9.24's <ControlBar> prefab. Changes: the
// screen-share toggle passes our capture/publish options (replacing the old monkeypatch) and
// has a quality/encoder menu, and the "Hidden" tiles and "Volume" menus live here.

// Not exported from components-react; mirrors its internal mapping.
const trackSourceToProtocol = (source: Track.Source) => {
  switch (source) {
    case Track.Source.Camera:
      return 1;
    case Track.Source.Microphone:
      return 2;
    case Track.Source.ScreenShare:
      return 3;
    default:
      return 0;
  }
};

function useMediaQuery(query: string) {
  const [matches, setMatches] = React.useState(false);
  React.useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

function supportsScreenSharing() {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;
}

export function GroupControlBar(props: { showSettings: boolean }) {
  const layoutContext = useMaybeLayoutContext();
  const isChatOpen = !!layoutContext?.widget.state?.showChat;
  // Upstream uses 1000/760; ours has three more controls.
  const isTooLittleSpace = useMediaQuery(`(max-width: ${isChatOpen ? 1200 : 960}px)`);
  const showText = !isTooLittleSpace;

  const permissions = useLocalParticipantPermissions();
  const canPublishSource = (source: Track.Source) =>
    !!permissions?.canPublish &&
    (permissions.canPublishSources.length === 0 ||
      permissions.canPublishSources.includes(trackSourceToProtocol(source)));
  const canChat = !!permissions?.canPublishData;

  const {
    saveAudioInputEnabled,
    saveVideoInputEnabled,
    saveAudioInputDeviceId,
    saveVideoInputDeviceId,
  } = usePersistentUserChoices();

  const room = useRoomContext();
  const screenShare = useScreenShareSettings();
  const [isScreenShareEnabled, setIsScreenShareEnabled] = React.useState(false);
  const captureOptions = React.useMemo(
    () => captureOptionsFor(screenShare.settings),
    [screenShare.settings],
  );
  const publishOptions = React.useMemo(
    () => publishOptionsFor(screenShare.settings, room.isE2EEEnabled),
    [screenShare.settings, room.isE2EEEnabled],
  );

  return (
    <div className="lk-control-bar">
      {canPublishSource(Track.Source.Microphone) && (
        <div className="lk-button-group">
          <TrackToggle
            source={Track.Source.Microphone}
            onChange={(enabled, isUserInitiated) =>
              isUserInitiated ? saveAudioInputEnabled(enabled) : null
            }
          >
            {showText && 'Microphone'}
          </TrackToggle>
          <div className="lk-button-group-menu">
            <MediaDeviceMenu
              kind="audioinput"
              onActiveDeviceChange={(_kind, deviceId) =>
                saveAudioInputDeviceId(deviceId ?? 'default')
              }
            />
          </div>
        </div>
      )}
      {canPublishSource(Track.Source.Camera) && (
        <div className="lk-button-group">
          <TrackToggle
            source={Track.Source.Camera}
            onChange={(enabled, isUserInitiated) =>
              isUserInitiated ? saveVideoInputEnabled(enabled) : null
            }
          >
            {showText && 'Camera'}
          </TrackToggle>
          <div className="lk-button-group-menu">
            <MediaDeviceMenu
              kind="videoinput"
              onActiveDeviceChange={(_kind, deviceId) =>
                saveVideoInputDeviceId(deviceId ?? 'default')
              }
            />
          </div>
        </div>
      )}
      {canPublishSource(Track.Source.ScreenShare) && supportsScreenSharing() && (
        <div className="lk-button-group">
          <TrackToggle
            source={Track.Source.ScreenShare}
            captureOptions={captureOptions}
            publishOptions={publishOptions}
            disabled={screenShare.applying}
            onChange={(enabled) => setIsScreenShareEnabled(enabled)}
          >
            {showText && (isScreenShareEnabled ? 'Stop screen share' : 'Share screen')}
          </TrackToggle>
          <BarMenu
            title="Screen share settings"
            className="lk-button-group-menu"
            buttonClassName="lk-button lk-button-menu"
          >
            <ScreenShareMenu
              settings={screenShare.settings}
              onChange={screenShare.update}
              applying={screenShare.applying}
              sharing={isScreenShareEnabled}
            />
          </BarMenu>
        </div>
      )}
      {canChat && (
        <ChatToggle>
          <ChatIcon />
          {showText && 'Chat'}
        </ChatToggle>
      )}
      {props.showSettings && (
        // SettingsMenuToggle isn't exported; this is what it renders.
        <button
          className="lk-button lk-settings-toggle"
          aria-pressed={layoutContext?.widget.state?.showSettings ? 'true' : 'false'}
          onClick={() => layoutContext?.widget.dispatch?.({ msg: 'toggle_settings' })}
        >
          <GearIcon />
          {showText && 'Settings'}
        </button>
      )}
      <VolumeMenu showText={showText} />
      <HiddenTilesMenu showText={showText} />
      <DisconnectButton>
        <LeaveIcon />
        {showText && 'Leave'}
      </DisconnectButton>
      <StartMediaButton />
    </div>
  );
}

function ScreenShareMenu(props: {
  settings: ScreenShareSettings;
  onChange: (settings: ScreenShareSettings) => void;
  applying: boolean;
  sharing: boolean;
}) {
  const { settings, onChange, applying } = props;
  return (
    <>
      <div className="bar-menu-heading">Quality</div>
      {(Object.keys(QUALITIES) as ScreenShareSettings['quality'][]).map((quality) => (
        <label className="bar-menu-row" key={quality}>
          <input
            type="radio"
            name="screen-share-quality"
            checked={settings.quality === quality}
            disabled={applying}
            onChange={() => onChange({ ...settings, quality })}
          />
          {QUALITIES[quality].label}
        </label>
      ))}
      <div className="bar-menu-heading">Encoder</div>
      {(Object.keys(ENCODERS) as ScreenShareSettings['encoder'][]).map((encoder) => (
        <label className="bar-menu-row" key={encoder}>
          <input
            type="radio"
            name="screen-share-encoder"
            checked={settings.encoder === encoder}
            disabled={applying}
            onChange={() => onChange({ ...settings, encoder })}
          />
          {ENCODERS[encoder].label}
        </label>
      ))}
      {(applying || props.sharing) && (
        <div className="bar-menu-note">
          {applying ? 'Applying…' : 'Changing these restarts your share for a moment.'}
        </div>
      )}
    </>
  );
}
