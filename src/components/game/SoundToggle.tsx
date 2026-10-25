"use client";

import { useSyncExternalStore } from "react";
import { sound } from "@/lib/juice";
import styles from "./BuildPhase.module.css";

// Mute / unmute the game sounds, and a volume slider under it. Both remembered per
// device (localStorage). Dragging the slider to 0 mutes; dragging it up unmutes.
export default function SoundToggle() {
  const muted = useSyncExternalStore(sound.subscribe, sound.isMuted, sound.isMutedOnServer);
  const volume = useSyncExternalStore(sound.subscribe, sound.getVolume, sound.getVolumeOnServer);
  return (
    <>
      <button
        type="button"
        className={styles.zoomButton}
        aria-label={muted ? "Turn sound on" : "Turn sound off"}
        aria-pressed={!muted}
        title={muted ? "Sound off" : "Sound on"}
        onClick={() => {
          sound.unlock();
          sound.toggleMuted();
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor" />
          {muted ? (
            <path d="M11 6l4 4M15 6l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          ) : (
            <path d="M11 5.5c1.2 1.4 1.2 3.6 0 5M12.8 4c2 2.3 2 5.7 0 8" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          )}
        </svg>
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={muted ? 0 : volume}
        aria-label="Volume"
        title={muted ? "Volume (muted)" : `Volume ${Math.round(volume * 100)}%`}
        onChange={(e) => {
          sound.unlock();
          const next = Number(e.target.value);
          if (next === 0) {
            if (!muted) sound.toggleMuted();
            return;
          }
          sound.setVolume(next);
          if (muted) sound.toggleMuted();
        }}
        // Vertical (min at the bottom), to fit the 40px zoom column. Inline because the
        // column's styles live in BuildPhase.module.css, which the sound track doesn't own.
        style={{ writingMode: "vertical-lr", direction: "rtl", width: 40, height: 72, margin: 0, accentColor: "var(--color-accent)", cursor: "pointer" }}
      />
    </>
  );
}
