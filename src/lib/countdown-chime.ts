// The countdown alarm chime and the per-browser "sound on" choice. Browsers block sound until a click, so it is
// armed by the person pressing the sound button; a refused play() is reported, never thrown.
import { useSyncExternalStore } from "react";

const KEY = "st-countdown-sound";
const EVENT = "st-countdown-sound-change";
const NOTES = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];

export function readAlarmSound() {
  try {
    return window.localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

export function writeAlarmSound(on: boolean) {
  try {
    window.localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // Storage blocked: the choice just does not persist.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** [soundOn, setSoundOn]; off on the server and during hydration. */
export function useAlarmSound() {
  const on = useSyncExternalStore(subscribe, readAlarmSound, () => false);
  return [on, writeAlarmSound] as const;
}

/** Plays the chime; resolves false when the browser refused or has no audio. */
export async function playAlarmChime() {
  const Ctor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return false;
  try {
    const context = new Ctor();
    await context.resume();
    if (context.state !== "running") {
      void context.close();
      return false;
    }
    const origin = context.currentTime + 0.01;
    NOTES.forEach((freq, index) => {
      const start = origin + index * 0.16;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.14, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.55);
    });
    window.setTimeout(() => void context.close(), 1_800);
    return true;
  } catch {
    return false;
  }
}
