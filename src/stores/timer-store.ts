import { create } from "zustand";

export type TimerPhase = "work" | "shortBreak" | "longBreak";

export type TimerDurations = {
  workMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
};

export const LONG_BREAK_CYCLE = 4;

const TICK_INTERVAL_MS = 250;

const DEFAULT_DURATIONS: TimerDurations = {
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
};

type TimerStoreState = {
  phase: TimerPhase;
  secondsLeft: number;
  isRunning: boolean;
  sessionCount: number;
  durations: TimerDurations;
  lastCompletedPhase: TimerPhase | null;
  lastCompletedAt: number | null;
  lastCompletedDurationMin: number | null;
  completionCount: number;
  targetEndsAt: number | null;
  intervalId: number | null;
  visibilityListenerAttached: boolean;
  visibilityListener: (() => void) | null;
  start: () => void;
  pause: () => void;
  resume: () => void;
  skip: () => void;
  reset: () => void;
  setDurations: (durations: Partial<TimerDurations>) => void;
  reconcileWithNow: () => void;
  __resetForTests: () => void;
};

function clampDuration(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Math.max(1, Math.min(180, Math.round(value)));
}

function minutesForPhase(phase: TimerPhase, durations: TimerDurations): number {
  if (phase === "work") {
    return durations.workMinutes;
  }

  if (phase === "shortBreak") {
    return durations.shortBreakMinutes;
  }

  return durations.longBreakMinutes;
}

function secondsForPhase(phase: TimerPhase, durations: TimerDurations): number {
  return minutesForPhase(phase, durations) * 60;
}

function nextBreakPhase(sessionCount: number): TimerPhase {
  return sessionCount > 0 && sessionCount % LONG_BREAK_CYCLE === 0 ? "longBreak" : "shortBreak";
}

function transitionPhase(args: {
  currentPhase: TimerPhase;
  sessionCount: number;
  durations: TimerDurations;
  countWorkSession: boolean;
}) {
  if (args.currentPhase === "work") {
    const nextSessionCount = args.countWorkSession ? args.sessionCount + 1 : args.sessionCount;
    const nextPhase = nextBreakPhase(nextSessionCount);

    return {
      nextPhase,
      nextSecondsLeft: secondsForPhase(nextPhase, args.durations),
      nextSessionCount,
    };
  }

  return {
    nextPhase: "work" as const,
    nextSecondsLeft: secondsForPhase("work", args.durations),
    nextSessionCount: args.sessionCount,
  };
}

function clearTicker(intervalId: number | null) {
  if (typeof window === "undefined" || intervalId === null) {
    return;
  }

  window.clearInterval(intervalId);
}

function detachVisibilityListener(state: TimerStoreState) {
  if (
    typeof document === "undefined" ||
    !state.visibilityListenerAttached ||
    !state.visibilityListener
  ) {
    return;
  }

  document.removeEventListener("visibilitychange", state.visibilityListener);
}

function initialState() {
  return {
    phase: "work" as const,
    secondsLeft: DEFAULT_DURATIONS.workMinutes * 60,
    isRunning: false,
    sessionCount: 0,
    durations: { ...DEFAULT_DURATIONS },
    lastCompletedPhase: null,
    lastCompletedAt: null,
    lastCompletedDurationMin: null,
    completionCount: 0,
    targetEndsAt: null,
    intervalId: null,
    visibilityListenerAttached: false,
    visibilityListener: null,
  };
}

export const useTimerStore = create<TimerStoreState>((set, get) => ({
  ...initialState(),

  start: () => {
    const state = get();
    if (state.isRunning) {
      return;
    }

    if (typeof document !== "undefined" && !state.visibilityListenerAttached) {
      const visibilityListener = () => {
        if (document.visibilityState === "visible") {
          get().reconcileWithNow();
        }
      };

      document.addEventListener("visibilitychange", visibilityListener);
      set({
        visibilityListenerAttached: true,
        visibilityListener,
      });
    }

    const baselineSeconds =
      state.secondsLeft > 0 ? state.secondsLeft : secondsForPhase(state.phase, state.durations);
    const targetEndsAt = Date.now() + baselineSeconds * 1000;

    clearTicker(state.intervalId);

    const intervalId =
      typeof window === "undefined"
        ? null
        : window.setInterval(() => {
            get().reconcileWithNow();
          }, TICK_INTERVAL_MS);

    set({
      secondsLeft: baselineSeconds,
      isRunning: true,
      targetEndsAt,
      intervalId,
    });
  },

  pause: () => {
    const state = get();
    if (!state.isRunning) {
      return;
    }

    clearTicker(state.intervalId);

    const now = Date.now();
    const remainingSeconds =
      state.targetEndsAt === null
        ? state.secondsLeft
        : Math.max(0, Math.ceil((state.targetEndsAt - now) / 1000));

    set({
      isRunning: false,
      secondsLeft: remainingSeconds,
      targetEndsAt: null,
      intervalId: null,
    });
  },

  resume: () => {
    get().start();
  },

  skip: () => {
    const state = get();
    clearTicker(state.intervalId);

    const next = transitionPhase({
      currentPhase: state.phase,
      sessionCount: state.sessionCount,
      durations: state.durations,
      countWorkSession: false,
    });

    set({
      phase: next.nextPhase,
      secondsLeft: next.nextSecondsLeft,
      sessionCount: next.nextSessionCount,
      isRunning: false,
      targetEndsAt: null,
      intervalId: null,
    });
  },

  reset: () => {
    const state = get();
    clearTicker(state.intervalId);

    set({
      phase: "work",
      secondsLeft: secondsForPhase("work", state.durations),
      sessionCount: 0,
      isRunning: false,
      targetEndsAt: null,
      intervalId: null,
      lastCompletedPhase: null,
      lastCompletedAt: null,
      lastCompletedDurationMin: null,
      completionCount: 0,
    });
  },

  setDurations: (durations) => {
    const state = get();
    const nextDurations: TimerDurations = {
      workMinutes: clampDuration(durations.workMinutes, state.durations.workMinutes),
      shortBreakMinutes: clampDuration(
        durations.shortBreakMinutes,
        state.durations.shortBreakMinutes
      ),
      longBreakMinutes: clampDuration(durations.longBreakMinutes, state.durations.longBreakMinutes),
    };

    set({
      durations: nextDurations,
      secondsLeft: state.isRunning
        ? state.secondsLeft
        : secondsForPhase(state.phase, nextDurations),
    });
  },

  reconcileWithNow: () => {
    const state = get();
    if (!state.isRunning || state.targetEndsAt === null) {
      return;
    }

    const now = Date.now();
    const remainingMs = state.targetEndsAt - now;

    if (remainingMs <= 0) {
      clearTicker(state.intervalId);

      const next = transitionPhase({
        currentPhase: state.phase,
        sessionCount: state.sessionCount,
        durations: state.durations,
        countWorkSession: state.phase === "work",
      });

      set({
        phase: next.nextPhase,
        secondsLeft: next.nextSecondsLeft,
        sessionCount: next.nextSessionCount,
        isRunning: false,
        targetEndsAt: null,
        intervalId: null,
        lastCompletedPhase: state.phase,
        lastCompletedAt: now,
        lastCompletedDurationMin: minutesForPhase(state.phase, state.durations),
        completionCount: state.completionCount + 1,
      });

      return;
    }

    const nextSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
    if (nextSeconds !== state.secondsLeft) {
      set({ secondsLeft: nextSeconds });
    }
  },

  __resetForTests: () => {
    const state = get();
    clearTicker(state.intervalId);
    detachVisibilityListener(state);

    set({
      ...initialState(),
    });
  },
}));
