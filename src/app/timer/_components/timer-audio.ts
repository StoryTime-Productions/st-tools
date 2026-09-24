import { readTimerPrefs } from "./timer-prefs";

type Note = { freq: number; at: number; dur: number; gain: number };

const PARTIALS = [
  { multiple: 1, level: 1 },
  { multiple: 2, level: 0.25 },
] as const;

const UI_CUES: Record<"play" | "pause" | "join" | "leave", Note[]> = {
  play: [
    { freq: 523.25, at: 0, dur: 0.35, gain: 0.1 },
    { freq: 783.99, at: 0.09, dur: 0.5, gain: 0.12 },
  ],
  pause: [
    { freq: 659.25, at: 0, dur: 0.3, gain: 0.09 },
    { freq: 440, at: 0.09, dur: 0.45, gain: 0.09 },
  ],
  join: [
    { freq: 659.25, at: 0, dur: 0.25, gain: 0.08 },
    { freq: 880, at: 0.08, dur: 0.35, gain: 0.08 },
  ],
  leave: [
    { freq: 587.33, at: 0, dur: 0.25, gain: 0.08 },
    { freq: 440, at: 0.08, dur: 0.35, gain: 0.08 },
  ],
};

const COMPLETION_CUE: Note[] = [523.25, 659.25, 783.99, 1046.5].map((freq, index) => ({
  freq,
  at: index * 0.13,
  dur: 0.5,
  gain: 0.12,
}));

function playNotes(notes: Note[]) {
  if (typeof window === "undefined" || !readTimerPrefs().soundEnabled) {
    return;
  }

  const AudioContextCtor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextCtor) {
    return;
  }

  try {
    const audioContext = new AudioContextCtor();
    const origin = audioContext.currentTime + 0.01;
    let totalSeconds = 0;

    for (const note of notes) {
      const startAt = origin + note.at;
      const endAt = startAt + note.dur;
      totalSeconds = Math.max(totalSeconds, note.at + note.dur);

      for (const { multiple, level } of PARTIALS) {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();

        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(note.freq * multiple, startAt);

        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(note.gain * level, startAt + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

        oscillator.connect(gain);
        gain.connect(audioContext.destination);

        oscillator.start(startAt);
        oscillator.stop(endAt + 0.02);
      }
    }

    window.setTimeout(
      () => {
        void audioContext.close();
      },
      Math.ceil((totalSeconds + 0.1) * 1000)
    );
  } catch {
    // Ignore blocked autoplay/audio failures.
  }
}

export async function playCompletionTone() {
  playNotes(COMPLETION_CUE);
}

export async function playUiCue(type: keyof typeof UI_CUES) {
  playNotes(UI_CUES[type]);
}
