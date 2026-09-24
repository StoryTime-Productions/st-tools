import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { playCompletionTone, playUiCue } from "@/app/timer/_components/timer-audio";

function installFakeAudioContext() {
  const oscillators: { start: ReturnType<typeof vi.fn> }[] = [];
  const close = vi.fn();

  class FakeAudioContext {
    currentTime = 0;
    destination = {};
    createOscillator() {
      const oscillator = {
        type: "",
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(oscillator);
      return oscillator;
    }
    createGain() {
      return {
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
      };
    }
    close = close;
  }

  vi.stubGlobal("AudioContext", FakeAudioContext);
  window.AudioContext = FakeAudioContext as unknown as typeof AudioContext;
  return { oscillators, close };
}

describe("timer-audio", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("plays two notes with two partials each for a ui cue, then closes the context", async () => {
    vi.useFakeTimers();
    const { oscillators, close } = installFakeAudioContext();

    await playUiCue("play");

    expect(oscillators).toHaveLength(4);
    vi.runAllTimers();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("plays the four-note completion cue", async () => {
    installFakeAudioContext();
    const { oscillators } = installFakeAudioContext();

    await playCompletionTone();

    expect(oscillators).toHaveLength(8);
  });

  it("does nothing when audio fails to start", async () => {
    vi.stubGlobal(
      "AudioContext",
      class {
        constructor() {
          throw new Error("blocked");
        }
      }
    );
    window.AudioContext = globalThis.AudioContext;

    await expect(playUiCue("pause")).resolves.toBeUndefined();
  });

  it("plays nothing when sound cues are turned off", async () => {
    const { oscillators } = installFakeAudioContext();
    window.localStorage.setItem(
      "timer-color-preferences-v1",
      JSON.stringify({ soundEnabled: false })
    );

    await playUiCue("play");
    await playCompletionTone();

    expect(oscillators).toHaveLength(0);
  });
});
