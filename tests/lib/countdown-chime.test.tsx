import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  playAlarmChime,
  readAlarmSound,
  useAlarmSound,
  writeAlarmSound,
} from "@/lib/countdown-chime";

function makeOscillator() {
  return {
    type: "",
    frequency: { setValueAtTime: vi.fn() },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

function makeGain() {
  return {
    gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
  };
}

type FakeContext = {
  close: ReturnType<typeof vi.fn>;
  createOscillator: ReturnType<typeof vi.fn>;
};

function installAudio(state = "running") {
  const contexts: FakeContext[] = [];
  class FakeAudioContext {
    state = state;
    currentTime = 0;
    destination = {};
    resume = vi.fn(async () => {});
    close = vi.fn(async () => {});
    createOscillator = vi.fn(makeOscillator);
    createGain = vi.fn(makeGain);
    constructor() {
      contexts.push(this as unknown as FakeContext);
    }
  }
  vi.stubGlobal("AudioContext", FakeAudioContext);
  return contexts;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("alarm sound preference", () => {
  it("is off until switched on and survives a reread", () => {
    expect(readAlarmSound()).toBe(false);
    writeAlarmSound(true);
    expect(readAlarmSound()).toBe(true);
    writeAlarmSound(false);
    expect(readAlarmSound()).toBe(false);
  });

  it("falls back to off when storage throws", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readAlarmSound()).toBe(false);
    expect(() => writeAlarmSound(true)).not.toThrow();
    get.mockRestore();
    set.mockRestore();
  });

  it("useAlarmSound follows writes and storage events", () => {
    const { result } = renderHook(() => useAlarmSound());
    expect(result.current[0]).toBe(false);
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    act(() => {
      window.localStorage.setItem("st-countdown-sound", "off");
      window.dispatchEvent(new Event("storage"));
    });
    expect(result.current[0]).toBe(false);
  });
});

describe("server render", () => {
  it("renders with the sound off, whatever the browser has stored", () => {
    window.localStorage.setItem("st-countdown-sound", "on");
    function Probe() {
      return <span>{useAlarmSound()[0] ? "on" : "off"}</span>;
    }
    expect(renderToString(<Probe />)).toContain("off");
  });
});

describe("playAlarmChime", () => {
  it("plays six notes and closes the context later", async () => {
    vi.useFakeTimers();
    const contexts = installAudio();
    await expect(playAlarmChime()).resolves.toBe(true);
    expect(contexts[0].createOscillator).toHaveBeenCalledTimes(6);
    vi.advanceTimersByTime(2_000);
    expect(contexts[0].close).toHaveBeenCalled();
  });

  it("reports false when the browser keeps the context suspended", async () => {
    const contexts = installAudio("suspended");
    await expect(playAlarmChime()).resolves.toBe(false);
    expect(contexts[0].close).toHaveBeenCalled();
  });

  it("reports false when audio is missing or throws", async () => {
    vi.stubGlobal("AudioContext", undefined);
    await expect(playAlarmChime()).resolves.toBe(false);
    vi.stubGlobal(
      "AudioContext",
      class {
        constructor() {
          throw new Error("no audio");
        }
      }
    );
    await expect(playAlarmChime()).resolves.toBe(false);
  });

  it("uses the webkit constructor when the standard one is absent", async () => {
    const contexts = installAudio();
    const Standard = window.AudioContext;
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("webkitAudioContext", Standard);
    await expect(playAlarmChime()).resolves.toBe(true);
    expect(contexts).toHaveLength(1);
  });
});
