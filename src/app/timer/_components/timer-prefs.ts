import { useSyncExternalStore } from "react";
import { normalizeHexColor } from "./timer-utils";
import type { TimerPrefs } from "./timer-settings-card";

const STORAGE_KEY = "timer-color-preferences-v1";

export const DEFAULT_TIMER_PREFS: TimerPrefs = {
  focusColor: "#3b82f6",
  breakColor: "#f97316",
  interpolatePhaseColors: true,
  autoStartBreaks: false,
  autoStartFocus: false,
  soundEnabled: true,
};

const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedPrefs = DEFAULT_TIMER_PREFS;

function parse(raw: string | null): TimerPrefs {
  try {
    const stored = JSON.parse(raw ?? "{}") as Partial<TimerPrefs>;
    return {
      focusColor: normalizeHexColor(stored.focusColor, DEFAULT_TIMER_PREFS.focusColor),
      breakColor: normalizeHexColor(stored.breakColor, DEFAULT_TIMER_PREFS.breakColor),
      interpolatePhaseColors: stored.interpolatePhaseColors !== false,
      autoStartBreaks: stored.autoStartBreaks === true,
      autoStartFocus: stored.autoStartFocus === true,
      soundEnabled: stored.soundEnabled !== false,
    };
  } catch {
    return DEFAULT_TIMER_PREFS;
  }
}

function getSnapshot(): TimerPrefs {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedPrefs = parse(raw);
  }
  return cachedPrefs;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function readTimerPrefs(): TimerPrefs {
  return typeof window === "undefined" ? DEFAULT_TIMER_PREFS : getSnapshot();
}

// Server snapshot is the defaults, so SSR and the first client render match.
export function useTimerPrefs(): TimerPrefs {
  return useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_TIMER_PREFS);
}

export function writeTimerPrefs(prefs: TimerPrefs) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  listeners.forEach((listener) => listener());
}
