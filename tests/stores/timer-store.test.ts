import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useTimerStore } from "@/stores/timer-store";

const initialNow = new Date("2026-03-20T10:00:00.000Z");
const originalVisibilityDescriptor = Object.getOwnPropertyDescriptor(document, "visibilityState");

let visibilityState: DocumentVisibilityState = "visible";

function setMockVisibilityState(state: DocumentVisibilityState) {
  visibilityState = state;
}

describe("timer store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(initialNow);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibilityState,
    });

    setMockVisibilityState("visible");
    useTimerStore.getState().__resetForTests();
  });

  afterAll(() => {
    useTimerStore.getState().__resetForTests();
    vi.useRealTimers();

    if (originalVisibilityDescriptor) {
      Object.defineProperty(document, "visibilityState", originalVisibilityDescriptor);
    }
  });

  it("reconciles remaining seconds using Date.now delta", () => {
    useTimerStore.getState().setDurations({
      workMinutes: 1,
      shortBreakMinutes: 1,
      longBreakMinutes: 2,
    });

    useTimerStore.getState().start();

    vi.setSystemTime(new Date(initialNow.getTime() + 20_000));
    useTimerStore.getState().reconcileWithNow();

    expect(useTimerStore.getState().secondsLeft).toBe(40);
  });

  it("reconciles on visibilitychange when tab becomes visible", () => {
    useTimerStore.getState().setDurations({
      workMinutes: 1,
      shortBreakMinutes: 1,
      longBreakMinutes: 2,
    });

    useTimerStore.getState().start();

    setMockVisibilityState("hidden");
    vi.setSystemTime(new Date(initialNow.getTime() + 15_000));
    document.dispatchEvent(new Event("visibilitychange"));

    expect(useTimerStore.getState().secondsLeft).toBe(60);

    setMockVisibilityState("visible");
    document.dispatchEvent(new Event("visibilitychange"));

    expect(useTimerStore.getState().secondsLeft).toBe(45);
  });

  it("moves to short break and increments session count on work completion", () => {
    useTimerStore.getState().setDurations({
      workMinutes: 1,
      shortBreakMinutes: 2,
      longBreakMinutes: 3,
    });

    useTimerStore.getState().start();

    vi.setSystemTime(new Date(initialNow.getTime() + 61_000));
    useTimerStore.getState().reconcileWithNow();

    const state = useTimerStore.getState();
    expect(state.phase).toBe("shortBreak");
    expect(state.secondsLeft).toBe(120);
    expect(state.sessionCount).toBe(1);
    expect(state.isRunning).toBe(false);
    expect(state.lastCompletedPhase).toBe("work");
    expect(state.completionCount).toBe(1);
  });

  it("uses long break after every fourth completed work session", () => {
    useTimerStore.setState({
      phase: "work",
      secondsLeft: 60,
      sessionCount: 3,
      durations: {
        workMinutes: 1,
        shortBreakMinutes: 2,
        longBreakMinutes: 3,
      },
      isRunning: false,
      targetEndsAt: null,
      intervalId: null,
    });

    useTimerStore.getState().start();

    vi.setSystemTime(new Date(initialNow.getTime() + 61_000));
    useTimerStore.getState().reconcileWithNow();

    const state = useTimerStore.getState();
    expect(state.phase).toBe("longBreak");
    expect(state.secondsLeft).toBe(180);
    expect(state.sessionCount).toBe(4);
  });

  it("supports skip and reset actions", () => {
    useTimerStore.getState().setDurations({
      workMinutes: 1,
      shortBreakMinutes: 2,
      longBreakMinutes: 3,
    });

    useTimerStore.getState().start();
    useTimerStore.getState().skip();

    expect(useTimerStore.getState().phase).toBe("shortBreak");
    expect(useTimerStore.getState().sessionCount).toBe(0);

    useTimerStore.getState().reset();

    const state = useTimerStore.getState();
    expect(state.phase).toBe("work");
    expect(state.secondsLeft).toBe(60);
    expect(state.sessionCount).toBe(0);
    expect(state.completionCount).toBe(0);
  });
});
