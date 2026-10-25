'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import React, { Suspense, useState } from 'react';
import styles from '../styles/Home.module.css';

// Room names are case sensitive in LiveKit, so "Hangout" and "hangout" would be two
// different rooms. Normalize what people type so a name said out loud lands in one room.
function normalizeRoomName(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '');
}

function JoinRoom() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Leaving a call lands here with ?room=<name>, so rejoining is one click.
  const [roomInput, setRoomInput] = useState(searchParams?.get('room') ?? '');
  const roomName = normalizeRoomName(roomInput);

  const onSubmit: React.FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    if (roomName) {
      router.push(`/rooms/${roomName}`);
    }
  };

  return (
    <form className={styles.card} onSubmit={onSubmit}>
      <h3 className={styles.cardTitle}>Join a room</h3>
      <input
        name="room"
        type="text"
        aria-label="Room name"
        value={roomInput}
        onChange={(ev) => setRoomInput(ev.target.value)}
        autoFocus
        autoComplete="off"
        spellCheck={false}
        required
      />
      {roomName && roomName !== roomInput && (
        <p className={styles.muted}>
          Joins <code>/rooms/{roomName}</code>
        </p>
      )}
      <button className="lk-button" type="submit" disabled={!roomName}>
        Join
      </button>
    </form>
  );
}

function ObsGuide() {
  return (
    <details className={styles.card}>
      <summary className={styles.cardTitle}>Stream from OBS</summary>
      <p className={styles.muted}>
        OBS streams with your GPU&apos;s hardware encoder and usually looks better than a
        browser screen share. You need OBS 30 or newer and a personal stream key.{' '}
        <strong>Contact the site owner for a stream key</strong>; it comes with a server URL
        and is tied to one room.
      </p>
      <ol className={styles.steps}>
        <li>
          <strong>Settings → Stream</strong>: Service <code>WHIP</code> (not &quot;Custom&quot;,
          that&apos;s RTMP). Server = the URL you were given, Bearer Token = your stream key.
        </li>
        <li>
          <strong>Settings → Output</strong>, Output Mode <code>Advanced</code>, Streaming tab:
          <ul>
            <li>
              Video Encoder: <code>NVIDIA NVENC H.264</code> (or your GPU&apos;s H.264
              encoder; never HEVC/AV1)
            </li>
            <li>
              Rate Control <code>CBR</code>, Bitrate <code>7000 Kbps</code>
            </li>
            <li>
              Keyframe Interval <code>2 s</code>
            </li>
            <li>
              B-frames <code>0</code> (otherwise viewers see stutter or nothing)
            </li>
          </ul>
        </li>
        <li>
          <strong>Settings → Video</strong>: Output (Scaled) Resolution{' '}
          <code>1920x1080</code>, FPS <code>60</code>.
        </li>
        <li>
          <strong>Start Streaming</strong>. You show up in the room as{' '}
          <code>yourname (OBS)</code>.
        </li>
        <li>
          Join the same room here to talk and watch. Hide your own OBS tile and turn its stream
          volume down so you don&apos;t hear your game twice.
        </li>
      </ol>
    </details>
  );
}

export default function Page() {
  return (
    <>
      <main className={styles.main} data-lk-theme="default">
        <div className="header">
          <img src="/images/livekit-meet-home.svg" alt="LiveKit Meet" width="360" height="45" />
          <h2>Voice, video and 60fps screen sharing for the group.</h2>
        </div>
        <div className={styles.cards}>
          <Suspense fallback="Loading">
            <JoinRoom />
          </Suspense>
          <ObsGuide />
        </div>
      </main>
      <footer data-lk-theme="default">
        Self-hosted fork of{' '}
        <a href="https://github.com/livekit-examples/meet" rel="noopener">
          LiveKit Meet
        </a>
        .
      </footer>
    </>
  );
}
