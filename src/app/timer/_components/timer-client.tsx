"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  DoorOpen,
  Gamepad2,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  UserPlus,
  Users,
} from "lucide-react";
import {
  addUserToFocusSessionAction,
  joinFocusSessionAction,
  kickFocusSessionMemberAction,
  leaveFocusSessionAction,
  recordPomodoroSessionAction,
  refreshPomodoroCollaborationAction,
  respondToFocusSessionRequestAction,
  saveMinigameScoreAction,
  startOwnFocusSessionAction,
  updatePomodoroPreferencesAction,
  syncFocusSessionTimerStateAction,
} from "@/app/actions/pomodoro";
import type {
  MinigameChampionSnapshot,
  MinigameLeaderboardSnapshot,
  PomodoroCollaborationSnapshot,
  PomodoroStatsSnapshot,
} from "@/lib/pomodoro";
import { LONG_BREAK_CYCLE, type TimerPhase, useTimerStore } from "@/stores/timer-store";
import { createClient } from "@/lib/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { AimMinigame } from "./minigames/AimMinigame";
import { BricksMinigame } from "./minigames/BricksMinigame";
import { ChampionsList } from "./minigames/ChampionsList";
import { CircleDrawMinigame } from "./minigames/CircleDrawMinigame";
import { MINIGAME_CONFIG, SHAKESPEARE_SNIPPET } from "./minigames/config";
import { CursorSurvivorMinigame } from "./minigames/CursorSurvivorMinigame";
import { DinoMinigame } from "./minigames/DinoMinigame";
import { FlappyArrowMinigame } from "./minigames/FlappyArrowMinigame";
import { TypingSprintMinigame } from "./minigames/TypingSprintMinigame";
import type {
  BrickState,
  CirclePoint,
  GamePosition,
  MinigameId,
  SurvivorShape,
} from "./minigames/types";

interface TimerClientProps {
  currentUserId: string;
  initialWorkMinutes: number;
  initialShortBreakMinutes: number;
  initialLongBreakMinutes: number;
  initialStats: PomodoroStatsSnapshot;
  initialCollaboration: PomodoroCollaborationSnapshot;
  initialLeaderboard: MinigameLeaderboardSnapshot;
  initialChampions: MinigameChampionSnapshot[];
}

const COLLABORATION_SYNC_INTERVAL_MS = 4000;
const TIMER_COLOR_PREFERENCES_KEY = "timer-color-preferences-v1";
const DEFAULT_FOCUS_COLOR = "#3b82f6";
const DEFAULT_BREAK_COLOR = "#f97316";
type StatsRange = "today" | "week" | "total";
type StatsFormat = "bar" | "line";

type StatsDatum = {
  label: string;
  value: number;
};

function formatClock(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${secs}`;
}

function phaseLabel(phase: TimerPhase): string {
  if (phase === "work") {
    return "Focus";
  }

  if (phase === "shortBreak") {
    return "Short break";
  }

  return "Long break";
}

function randomGamePosition(): GamePosition {
  const x = 10 + Math.random() * 80;
  const y = 16 + Math.random() * 68;
  return { x, y };
}

function createInitialBricks(): BrickState[] {
  const bricks: BrickState[] = [];

  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      bricks.push({
        x: 8 + col * 23,
        y: 8 + row * 10,
        alive: true,
      });
    }
  }

  return bricks;
}

function isBreakPhase(phase: TimerPhase): boolean {
  return phase === "shortBreak" || phase === "longBreak";
}

function clampDurationInput(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, Math.round(value)));
}

function getDisplayName(name: string | null, email: string): string {
  return name?.trim() || email;
}

function initialsFromName(name: string | null, email: string): string {
  const source = getDisplayName(name, email).trim();
  if (!source) {
    return "?";
  }

  const parts = source
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return source.slice(0, 2).toUpperCase();
  }

  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? (parts[1]?.[0] ?? "") : "";
  return `${first}${second}`.toUpperCase() || source.slice(0, 2).toUpperCase();
}

function normalizeHexColor(value: string | null | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return normalized.toLowerCase();
  }

  return fallback;
}

function hexToRgb(hexColor: string): { r: number; g: number; b: number } {
  const hex = normalizeHexColor(hexColor, "#000000").slice(1);

  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function rgbToHex(rgb: { r: number; g: number; b: number }): string {
  const toHex = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

function mixHexColors(fromHex: string, toHex: string, ratio: number): string {
  const clampedRatio = Math.max(0, Math.min(1, ratio));
  const from = hexToRgb(fromHex);
  const to = hexToRgb(toHex);

  return rgbToHex({
    r: from.r + (to.r - from.r) * clampedRatio,
    g: from.g + (to.g - from.g) * clampedRatio,
    b: from.b + (to.b - from.b) * clampedRatio,
  });
}

function toRgba(hexColor: string, alpha: number): string {
  const color = hexToRgb(hexColor);
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${Math.max(0, Math.min(1, alpha))})`;
}

async function playCompletionTone() {
  if (typeof window === "undefined") {
    return;
  }

  const AudioContextCtor =
    window.AudioContext ??
    (
      window as Window & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;

  if (!AudioContextCtor) {
    return;
  }

  try {
    const audioContext = new AudioContextCtor();
    const startAt = audioContext.currentTime + 0.01;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    const noteDuration = 0.12;
    const noteGap = 0.015;

    notes.forEach((frequency, index) => {
      const noteStart = startAt + index * (noteDuration + noteGap);
      const noteEnd = noteStart + noteDuration;

      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(frequency, noteStart);

      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(0.16, noteStart + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

      oscillator.connect(gain);
      gain.connect(audioContext.destination);

      oscillator.start(noteStart);
      oscillator.stop(noteEnd + 0.01);
    });

    const totalDuration = notes.length * (noteDuration + noteGap) + 0.05;
    window.setTimeout(
      () => {
        void audioContext.close();
      },
      Math.ceil(totalDuration * 1000)
    );
  } catch {
    // Ignore blocked autoplay/audio failures.
  }
}

async function playUiCue(type: "play" | "pause" | "join" | "leave") {
  if (typeof window === "undefined") {
    return;
  }

  const AudioContextCtor =
    window.AudioContext ??
    (
      window as Window & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;

  if (!AudioContextCtor) {
    return;
  }

  try {
    const audioContext = new AudioContextCtor();
    const now = audioContext.currentTime + 0.005;

    const tones: Record<typeof type, [number, number]> = {
      play: [880, 1108.73],
      pause: [740, 523.25],
      join: [659.25, 880],
      leave: [587.33, 440],
    };

    tones[type].forEach((frequency, index) => {
      const startAt = now + index * 0.075;
      const endAt = startAt + 0.08;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(frequency, startAt);

      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.08, startAt + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

      oscillator.connect(gain);
      gain.connect(audioContext.destination);

      oscillator.start(startAt);
      oscillator.stop(endAt + 0.01);
    });

    window.setTimeout(() => {
      void audioContext.close();
    }, 260);
  } catch {
    // Ignore blocked autoplay/audio failures.
  }
}

function incrementStats(previous: PomodoroStatsSnapshot): PomodoroStatsSnapshot {
  const nextLast7Days = [...previous.last7Days];
  const lastIndex = nextLast7Days.length - 1;

  if (lastIndex >= 0) {
    const day = nextLast7Days[lastIndex];
    nextLast7Days[lastIndex] = {
      ...day,
      count: day.count + 1,
    };
  }

  return {
    todayCount: previous.todayCount + 1,
    weekCount: previous.weekCount + 1,
    totalCount: previous.totalCount + 1,
    last7Days: nextLast7Days,
  };
}

export function TimerClient({
  currentUserId,
  initialWorkMinutes,
  initialShortBreakMinutes,
  initialLongBreakMinutes,
  initialStats,
  initialCollaboration,
  initialLeaderboard,
  initialChampions,
}: TimerClientProps) {
  const [stats, setStats] = useState(initialStats);
  const [collaboration, setCollaboration] = useState(initialCollaboration);
  const [leaderboard, setLeaderboard] = useState(initialLeaderboard);
  const [champions, setChampions] = useState(initialChampions);
  const [isPersistingSession, startPersistingSession] = useTransition();
  const [isSavingPreferences, startSavingPreferences] = useTransition();
  const [isUpdatingCollaboration, startUpdatingCollaboration] = useTransition();
  const [isSavingMinigameScore, startSavingMinigameScore] = useTransition();

  const [workMinutesInput, setWorkMinutesInput] = useState(() => initialWorkMinutes);
  const [shortBreakMinutesInput, setShortBreakMinutesInput] = useState(
    () => initialShortBreakMinutes
  );
  const [longBreakMinutesInput, setLongBreakMinutesInput] = useState(() => initialLongBreakMinutes);
  const [showTimerSettings, setShowTimerSettings] = useState(true);
  const [sessionTitleInput, setSessionTitleInput] = useState("");
  const [focusColor, setFocusColor] = useState(() => {
    if (typeof window === "undefined") {
      return DEFAULT_FOCUS_COLOR;
    }

    const rawValue = window.localStorage.getItem(TIMER_COLOR_PREFERENCES_KEY);
    if (!rawValue) {
      return DEFAULT_FOCUS_COLOR;
    }

    try {
      const parsed = JSON.parse(rawValue) as { focusColor?: string };
      return normalizeHexColor(parsed.focusColor, DEFAULT_FOCUS_COLOR);
    } catch {
      return DEFAULT_FOCUS_COLOR;
    }
  });
  const [breakColor, setBreakColor] = useState(() => {
    if (typeof window === "undefined") {
      return DEFAULT_BREAK_COLOR;
    }

    const rawValue = window.localStorage.getItem(TIMER_COLOR_PREFERENCES_KEY);
    if (!rawValue) {
      return DEFAULT_BREAK_COLOR;
    }

    try {
      const parsed = JSON.parse(rawValue) as { breakColor?: string };
      return normalizeHexColor(parsed.breakColor, DEFAULT_BREAK_COLOR);
    } catch {
      return DEFAULT_BREAK_COLOR;
    }
  });
  const [interpolatePhaseColors, setInterpolatePhaseColors] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }

    const rawValue = window.localStorage.getItem(TIMER_COLOR_PREFERENCES_KEY);
    if (!rawValue) {
      return true;
    }

    try {
      const parsed = JSON.parse(rawValue) as { interpolatePhaseColors?: boolean };
      return parsed.interpolatePhaseColors !== false;
    } catch {
      return true;
    }
  });
  const [autoStartBreaks, setAutoStartBreaks] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    const rawValue = window.localStorage.getItem(TIMER_COLOR_PREFERENCES_KEY);
    if (!rawValue) {
      return false;
    }

    try {
      const parsed = JSON.parse(rawValue) as { autoStartBreaks?: boolean };
      return parsed.autoStartBreaks === true;
    } catch {
      return false;
    }
  });
  const [autoStartFocus, setAutoStartFocus] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    const rawValue = window.localStorage.getItem(TIMER_COLOR_PREFERENCES_KEY);
    if (!rawValue) {
      return false;
    }

    try {
      const parsed = JSON.parse(rawValue) as { autoStartFocus?: boolean };
      return parsed.autoStartFocus === true;
    } catch {
      return false;
    }
  });
  const [selectedInviteUserId, setSelectedInviteUserId] = useState("");
  const [selectedStatsRange, setSelectedStatsRange] = useState<StatsRange>("week");
  const [selectedStatsFormat, setSelectedStatsFormat] = useState<StatsFormat>("bar");

  const [selectedMinigame, setSelectedMinigame] = useState<MinigameId>("aim");
  const [activeMinigame, setActiveMinigame] = useState<MinigameId>("aim");
  const [isGameActive, setIsGameActive] = useState(false);
  const [gameScore, setGameScore] = useState(0);
  const [lastBreakScore, setLastBreakScore] = useState<number | null>(null);
  const [targetPosition, setTargetPosition] = useState<GamePosition>(() => randomGamePosition());
  const [dinoObstacleX, setDinoObstacleX] = useState(100);
  const [dinoJumping, setDinoJumping] = useState(false);
  const [bricks, setBricks] = useState<BrickState[]>(() => createInitialBricks());
  const [brickBall, setBrickBall] = useState({ x: 50, y: 60 });
  const [brickPaddleX, setBrickPaddleX] = useState(50);
  const [flappyArrowY, setFlappyArrowY] = useState(50);
  const [flappyPipeX, setFlappyPipeX] = useState(100);
  const [flappyGapY, setFlappyGapY] = useState(45);
  const [typingValue, setTypingValue] = useState("");
  const [circlePoints, setCirclePoints] = useState<CirclePoint[]>([]);
  const [isCircleDrawing, setIsCircleDrawing] = useState(false);
  const [survivorShapes, setSurvivorShapes] = useState<SurvivorShape[]>([]);
  const [sharedTimerNow, setSharedTimerNow] = useState(() => Date.now());
  const [runningNow, setRunningNow] = useState(() => Date.now());

  const handledCompletionRef = useRef(0);
  const dinoJumpUntilRef = useRef(0);
  const bricksRef = useRef({
    bricks: createInitialBricks(),
    ballX: 50,
    ballY: 60,
    ballVx: 1.8,
    ballVy: -2.2,
    paddleX: 50,
  });
  const flappyRef = useRef({
    arrowY: 50,
    velocity: 0,
    pipeX: 100,
    gapY: 45,
  });
  const survivorRef = useRef({
    startedAt: 0,
    nextId: 1,
    mouseX: 50,
    mouseY: 50,
  });
  const circleLastPointRef = useRef<CirclePoint | null>(null);

  const phase = useTimerStore((state) => state.phase);
  const secondsLeft = useTimerStore((state) => state.secondsLeft);
  const isRunning = useTimerStore((state) => state.isRunning);
  const targetEndsAt = useTimerStore((state) => state.targetEndsAt);
  const sessionCount = useTimerStore((state) => state.sessionCount);
  const completionCount = useTimerStore((state) => state.completionCount);
  const lastCompletedPhase = useTimerStore((state) => state.lastCompletedPhase);
  const lastCompletedDurationMin = useTimerStore((state) => state.lastCompletedDurationMin);
  const durations = useTimerStore((state) => state.durations);
  const start = useTimerStore((state) => state.start);
  const pause = useTimerStore((state) => state.pause);
  const resume = useTimerStore((state) => state.resume);
  const skip = useTimerStore((state) => state.skip);
  const reset = useTimerStore((state) => state.reset);
  const setDurations = useTimerStore((state) => state.setDurations);

  const currentSession = collaboration.currentSession;
  const isSessionOwner = currentSession?.ownerId === currentUserId;
  const isLockedBySharedSession = Boolean(currentSession && !isSessionOwner);
  const currentLeaderboardEntry =
    leaderboard.entries.find((entry) => entry.userId === currentUserId) ?? null;
  const incomingRequests = collaboration.incomingRequests;
  const outgoingRequests = collaboration.outgoingRequests;

  const currentSessionRef = useRef(currentSession);
  const isSessionOwnerRef = useRef(isSessionOwner);
  const previousMembersRef = useRef<{ sessionId: string | null; memberIds: string[] }>({
    sessionId: null,
    memberIds: [],
  });
  const sharedCompletionStateRef = useRef<{ sessionId: string | null; completionCount: number }>({
    sessionId: null,
    completionCount: 0,
  });

  useEffect(() => {
    setDurations({
      workMinutes: initialWorkMinutes,
      shortBreakMinutes: initialShortBreakMinutes,
      longBreakMinutes: initialLongBreakMinutes,
    });
  }, [initialLongBreakMinutes, initialShortBreakMinutes, initialWorkMinutes, setDurations]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (isLockedBySharedSession) {
      return;
    }

    window.localStorage.setItem(
      TIMER_COLOR_PREFERENCES_KEY,
      JSON.stringify({
        focusColor,
        breakColor,
        interpolatePhaseColors,
        autoStartBreaks,
        autoStartFocus,
      })
    );
  }, [
    autoStartBreaks,
    autoStartFocus,
    breakColor,
    focusColor,
    interpolatePhaseColors,
    isLockedBySharedSession,
  ]);

  useEffect(() => {
    currentSessionRef.current = currentSession;
    isSessionOwnerRef.current = isSessionOwner;
  }, [currentSession, isSessionOwner]);

  useEffect(() => {
    if (!currentSession) {
      previousMembersRef.current = { sessionId: null, memberIds: [] };
      return;
    }

    const memberIds = currentSession.members.map((member) => member.userId).sort();
    const previous = previousMembersRef.current;

    if (previous.sessionId !== currentSession.id) {
      previousMembersRef.current = { sessionId: currentSession.id, memberIds };
      return;
    }

    const previousSet = new Set(previous.memberIds);
    const currentSet = new Set(memberIds);

    const joined = memberIds.some((id) => !previousSet.has(id));
    const left = previous.memberIds.some((id) => !currentSet.has(id));

    if (joined) {
      void playUiCue("join");
    } else if (left) {
      void playUiCue("leave");
    }

    previousMembersRef.current = { sessionId: currentSession.id, memberIds };
  }, [currentSession]);

  const applyCollaborationSnapshot = useCallback((snapshot: PomodoroCollaborationSnapshot) => {
    setCollaboration(snapshot);
  }, []);

  const refreshCollaborationSnapshot = useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }

    const result = await refreshPomodoroCollaborationAction();
    if ("error" in result) {
      return;
    }

    applyCollaborationSnapshot(result.snapshot);
  }, [applyCollaborationSnapshot]);

  const syncSharedTimerStateFromStore = useCallback(() => {
    if (!currentSession || !isSessionOwner) {
      return;
    }

    const state = useTimerStore.getState();

    startUpdatingCollaboration(async () => {
      const result = await syncFocusSessionTimerStateAction({
        sessionId: currentSession.id,
        phase: state.phase,
        secondsLeft: state.secondsLeft,
        sessionCount: state.sessionCount,
        completionCount: state.completionCount,
        lastCompletedPhase: state.lastCompletedPhase,
        lastCompletedDurationMin: state.lastCompletedDurationMin,
        isRunning: state.isRunning,
        workMinutes: state.durations.workMinutes,
        shortBreakMinutes: state.durations.shortBreakMinutes,
        longBreakMinutes: state.durations.longBreakMinutes,
        focusColor,
        breakColor,
        interpolatePhaseColors,
        autoStartBreaks,
        autoStartFocus,
      });

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      applyCollaborationSnapshot(result.snapshot);
    });
  }, [
    autoStartBreaks,
    autoStartFocus,
    breakColor,
    currentSession,
    focusColor,
    interpolatePhaseColors,
    isSessionOwner,
    startUpdatingCollaboration,
    applyCollaborationSnapshot,
  ]);

  useEffect(() => {
    let isCancelled = false;

    async function syncCollaborationSnapshot() {
      const result = await refreshPomodoroCollaborationAction();
      if (isCancelled || "error" in result) {
        return;
      }

      setCollaboration(result.snapshot);
    }

    void syncCollaborationSnapshot();

    const intervalId = window.setInterval(() => {
      void syncCollaborationSnapshot();
    }, COLLABORATION_SYNC_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void syncCollaborationSnapshot();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!currentSession?.id) {
      return;
    }

    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      return;
    }

    const channel = supabase
      .channel(`focus-session:${currentSession.id}:realtime`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pomodoro_focus_sessions",
          filter: `id=eq.${currentSession.id}`,
        },
        () => {
          void refreshCollaborationSnapshot();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentSession?.id, refreshCollaborationSnapshot]);

  useEffect(() => {
    if (!isLockedBySharedSession) {
      return;
    }

    pause();
  }, [isLockedBySharedSession, pause]);

  useEffect(() => {
    if (!isLockedBySharedSession || !currentSession?.sharedTimer) {
      return;
    }

    const sharedTimer = currentSession.sharedTimer;

    setDurations({
      workMinutes: sharedTimer.workMinutes,
      shortBreakMinutes: sharedTimer.shortBreakMinutes,
      longBreakMinutes: sharedTimer.longBreakMinutes,
    });

    useTimerStore.setState((state) => ({
      ...state,
      phase: sharedTimer.phase,
      secondsLeft: sharedTimer.secondsLeft,
      sessionCount: sharedTimer.sessionCount,
      isRunning: false,
      targetEndsAt: null,
      intervalId: null,
    }));
  }, [currentSession?.sharedTimer, isLockedBySharedSession, setDurations]);

  useEffect(() => {
    if (!isLockedBySharedSession || !currentSession?.sharedTimer?.isRunning) {
      return;
    }

    const startedAtRaw = currentSession.sharedTimer.startedAt;
    const startedAtMs = startedAtRaw ? Date.parse(startedAtRaw) : Number.NaN;
    if (Number.isNaN(startedAtMs)) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setSharedTimerNow(Date.now());
    }, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [currentSession?.sharedTimer, isLockedBySharedSession]);

  useEffect(() => {
    if (isLockedBySharedSession || !isRunning || targetEndsAt === null) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setRunningNow(Date.now());
    }, 120);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isLockedBySharedSession, isRunning, targetEndsAt]);

  const displaySecondsLeft = useMemo(() => {
    if (!isLockedBySharedSession || !currentSession?.sharedTimer) {
      return secondsLeft;
    }

    const sharedTimer = currentSession.sharedTimer;
    if (!sharedTimer.isRunning || !sharedTimer.startedAt) {
      return sharedTimer.secondsLeft;
    }

    const startedAtMs = Date.parse(sharedTimer.startedAt);
    if (Number.isNaN(startedAtMs)) {
      return sharedTimer.secondsLeft;
    }

    const elapsedSeconds = Math.max(0, Math.floor((sharedTimerNow - startedAtMs) / 1000));
    return Math.max(0, sharedTimer.secondsLeft - elapsedSeconds);
  }, [currentSession?.sharedTimer, isLockedBySharedSession, secondsLeft, sharedTimerNow]);

  useEffect(() => {
    if (completionCount === 0 || completionCount === handledCompletionRef.current) {
      return;
    }

    handledCompletionRef.current = completionCount;

    if (!lastCompletedPhase) {
      return;
    }

    toast.success(`${phaseLabel(lastCompletedPhase)} complete`, {
      description:
        lastCompletedPhase === "work"
          ? "Great work. Time for a break."
          : "Break finished. Time to focus again.",
    });

    void playCompletionTone();

    if (isBreakPhase(lastCompletedPhase)) {
      const breakScore = isGameActive ? gameScore : 0;
      const wasGameActive = isGameActive;

      queueMicrotask(() => {
        if (wasGameActive) {
          setIsGameActive(false);
        }
        setLastBreakScore(breakScore);
        setGameScore(0);
      });

      if (wasGameActive) {
        startSavingMinigameScore(async () => {
          const gameKey = MINIGAME_CONFIG[activeMinigame].key;
          const result = await saveMinigameScoreAction({
            gameKey,
            score: breakScore,
          });

          if ("error" in result) {
            toast.error(result.error);
            return;
          }

          setLeaderboard(result.leaderboard);

          const topEntry = result.leaderboard.entries[0] ?? null;
          setChampions((previous) =>
            previous.map((champion) => {
              if (champion.gameKey !== gameKey) {
                return champion;
              }

              if (!topEntry) {
                return {
                  ...champion,
                  championName: "No champion yet",
                  championUserId: null,
                  championScore: 0,
                };
              }

              return {
                ...champion,
                championName: topEntry.name?.trim() || topEntry.email,
                championUserId: topEntry.userId,
                championScore: topEntry.allTimeScore,
              };
            })
          );

          if (result.submitted) {
            toast.success("Minigame score submitted");
          } else {
            toast.info(result.message ?? "Score not submitted");
          }
        });
      }
    }

    if (lastCompletedPhase === "work" && lastCompletedDurationMin) {
      startPersistingSession(async () => {
        const result = await recordPomodoroSessionAction({
          durationMin: lastCompletedDurationMin,
        });

        if ("error" in result) {
          toast.error(result.error);
          return;
        }

        setStats((previous) => incrementStats(previous));
      });
    }

    const shouldAutoStartNextPhase =
      (lastCompletedPhase === "work" && autoStartBreaks) ||
      (isBreakPhase(lastCompletedPhase) && autoStartFocus);

    if (shouldAutoStartNextPhase) {
      start();
    }

    if (currentSessionRef.current && isSessionOwnerRef.current) {
      syncSharedTimerStateFromStore();
    }
  }, [
    activeMinigame,
    autoStartBreaks,
    autoStartFocus,
    completionCount,
    gameScore,
    isGameActive,
    lastCompletedDurationMin,
    lastCompletedPhase,
    start,
    startPersistingSession,
    startSavingMinigameScore,
    syncSharedTimerStateFromStore,
  ]);

  useEffect(() => {
    if (!currentSession?.sharedTimer || isSessionOwner) {
      return;
    }

    const { id: sessionId, sharedTimer } = currentSession;
    const previous = sharedCompletionStateRef.current;

    if (previous.sessionId !== sessionId) {
      sharedCompletionStateRef.current = {
        sessionId,
        completionCount: sharedTimer.completionCount,
      };
      return;
    }

    if (sharedTimer.completionCount <= previous.completionCount) {
      return;
    }

    const completedPhase = sharedTimer.lastCompletedPhase;

    if (completedPhase) {
      toast.success(`${phaseLabel(completedPhase)} complete`, {
        description:
          completedPhase === "work"
            ? "Great work. Time for a break."
            : "Break finished. Time to focus again.",
      });

      void playCompletionTone();

      if (completedPhase === "work") {
        const durationMin = sharedTimer.lastCompletedDurationMin ?? sharedTimer.workMinutes;

        startPersistingSession(async () => {
          const result = await recordPomodoroSessionAction({
            durationMin,
          });

          if ("error" in result) {
            return;
          }

          setStats((previous) => incrementStats(previous));
        });
      }
    }

    sharedCompletionStateRef.current = {
      sessionId,
      completionCount: sharedTimer.completionCount,
    };
  }, [currentSession, isSessionOwner, startPersistingSession]);

  useEffect(() => {
    if (!isGameActive || activeMinigame !== "dino") {
      return;
    }

    const intervalId = window.setInterval(() => {
      const isJumping = dinoJumpUntilRef.current > Date.now();

      setDinoJumping(isJumping);
      setDinoObstacleX((current) => {
        const next = current - 4;

        if (next <= -12) {
          setGameScore((value) => value + 1);
          return 100;
        }

        if (next < 22 && next > 8 && !isJumping) {
          setIsGameActive(false);
        }

        return next;
      });
    }, 50);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeMinigame, isGameActive]);

  useEffect(() => {
    if (!isGameActive || activeMinigame !== "bricks") {
      return;
    }

    const intervalId = window.setInterval(() => {
      const state = bricksRef.current;
      let { ballX, ballY, ballVx, ballVy } = state;
      const { paddleX } = state;
      let nextBricks = [...state.bricks];

      ballX += ballVx;
      ballY += ballVy;

      if (ballX <= 2 || ballX >= 98) {
        ballVx *= -1;
      }

      if (ballY <= 2) {
        ballVy *= -1;
      }

      if (ballY >= 84 && ballY <= 92 && Math.abs(ballX - paddleX) <= 12 && ballVy > 0) {
        ballVy = -Math.abs(ballVy);
        setGameScore((value) => value + 1);
      }

      nextBricks = nextBricks.map((brick) => {
        if (!brick.alive) {
          return brick;
        }

        const hitX = ballX >= brick.x && ballX <= brick.x + 18;
        const hitY = ballY >= brick.y && ballY <= brick.y + 8;

        if (hitX && hitY) {
          ballVy *= -1;
          setGameScore((value) => value + 2);
          return { ...brick, alive: false };
        }

        return brick;
      });

      if (nextBricks.every((brick) => !brick.alive)) {
        nextBricks = createInitialBricks();
      }

      if (ballY >= 101) {
        setIsGameActive(false);
      }

      state.ballX = ballX;
      state.ballY = ballY;
      state.ballVx = ballVx;
      state.ballVy = ballVy;
      state.paddleX = paddleX;
      state.bricks = nextBricks;

      setBrickBall({ x: ballX, y: ballY });
      setBricks(nextBricks);
    }, 45);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeMinigame, isGameActive]);

  useEffect(() => {
    if (!isGameActive || activeMinigame !== "flappy") {
      return;
    }

    const intervalId = window.setInterval(() => {
      const state = flappyRef.current;

      state.velocity += 0.9;
      state.arrowY += state.velocity * 0.3;
      state.pipeX -= 3.6;

      if (state.pipeX < -12) {
        state.pipeX = 100;
        state.gapY = 24 + Math.random() * 52;
        setGameScore((value) => value + 1);
      }

      const nearPipe = state.pipeX < 24 && state.pipeX > 4;
      const outsideGap = state.arrowY < state.gapY - 14 || state.arrowY > state.gapY + 14;
      const outOfBounds = state.arrowY < 2 || state.arrowY > 98;

      if ((nearPipe && outsideGap) || outOfBounds) {
        setIsGameActive(false);
      }

      setFlappyArrowY(state.arrowY);
      setFlappyPipeX(state.pipeX);
      setFlappyGapY(state.gapY);
    }, 45);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeMinigame, isGameActive]);

  useEffect(() => {
    if (!isGameActive || activeMinigame !== "survivor") {
      return;
    }

    const intervalId = window.setInterval(() => {
      setSurvivorShapes((previous) => {
        const withTtl = previous
          .map((shape) => ({ ...shape, ttl: shape.ttl - 1 }))
          .filter((shape) => shape.ttl > 0);

        const shouldSpawn = Math.random() < 0.35;
        if (!shouldSpawn) {
          return withTtl;
        }

        const nextShape = {
          id: survivorRef.current.nextId,
          x: 5 + Math.random() * 80,
          y: 8 + Math.random() * 74,
          width: 8 + Math.random() * 16,
          height: 8 + Math.random() * 16,
          ttl: 9,
        };

        survivorRef.current.nextId += 1;

        return [...withTtl, nextShape];
      });

      const survivedSeconds = Math.max(
        0,
        Math.floor((Date.now() - survivorRef.current.startedAt) / 1000)
      );
      setGameScore(survivedSeconds);
    }, 120);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeMinigame, isGameActive]);

  const startMinigame = useCallback(() => {
    setActiveMinigame(selectedMinigame);
    setGameScore(0);
    setLastBreakScore(null);

    if (selectedMinigame === "aim") {
      setTargetPosition(randomGamePosition());
    }

    if (selectedMinigame === "dino") {
      dinoJumpUntilRef.current = 0;
      setDinoJumping(false);
      setDinoObstacleX(100);
    }

    if (selectedMinigame === "bricks") {
      const nextBricks = createInitialBricks();
      bricksRef.current = {
        bricks: nextBricks,
        ballX: 50,
        ballY: 60,
        ballVx: 1.8,
        ballVy: -2.2,
        paddleX: 50,
      };
      setBricks(nextBricks);
      setBrickBall({ x: 50, y: 60 });
      setBrickPaddleX(50);
    }

    if (selectedMinigame === "flappy") {
      flappyRef.current = {
        arrowY: 50,
        velocity: 0,
        pipeX: 100,
        gapY: 45,
      };
      setFlappyArrowY(50);
      setFlappyPipeX(100);
      setFlappyGapY(45);
    }

    if (selectedMinigame === "typing") {
      setTypingValue("");
    }

    if (selectedMinigame === "circle") {
      setCirclePoints([]);
      setIsCircleDrawing(false);
    }

    if (selectedMinigame === "survivor") {
      survivorRef.current.startedAt = Date.now();
      survivorRef.current.nextId = 1;
      survivorRef.current.mouseX = 50;
      survivorRef.current.mouseY = 50;
      setSurvivorShapes([]);
    }

    setIsGameActive(true);
  }, [selectedMinigame]);

  const jumpDino = useCallback(() => {
    dinoJumpUntilRef.current = Date.now() + 550;
    setDinoJumping(true);
  }, []);

  const flapArrow = useCallback(() => {
    flappyRef.current.velocity = -5.2;
  }, []);

  const moveBrickPaddle = useCallback((nextX: number) => {
    const clamped = Math.max(10, Math.min(90, nextX));
    bricksRef.current.paddleX = clamped;
    setBrickPaddleX(clamped);
  }, []);

  const handleTypingChange = useCallback((nextValue: string) => {
    const targetText = SHAKESPEARE_SNIPPET.repeat(16);
    const clamped = nextValue.slice(0, targetText.length);

    if (!targetText.startsWith(clamped)) {
      return;
    }

    setTypingValue(clamped);
    setGameScore((value) => Math.max(value, clamped.length));
  }, []);

  const beginCircleDraw = useCallback(() => {
    setCirclePoints([]);
    setIsCircleDrawing(true);
    circleLastPointRef.current = null;
  }, []);

  const addCirclePoint = useCallback((clientX: number, clientY: number, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));

    const nextPoint: CirclePoint = { x, y };
    const previousPoint = circleLastPointRef.current;

    if (!previousPoint) {
      circleLastPointRef.current = nextPoint;
      setCirclePoints((previous) => [...previous, nextPoint]);
      return;
    }

    const dx = nextPoint.x - previousPoint.x;
    const dy = nextPoint.y - previousPoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const maxSegment = 1.2;

    if (distance <= 0) {
      return;
    }

    const steps = Math.max(1, Math.ceil(distance / maxSegment));
    const interpolated: CirclePoint[] = [];

    for (let step = 1; step <= steps; step += 1) {
      const ratio = step / steps;
      interpolated.push({
        x: previousPoint.x + dx * ratio,
        y: previousPoint.y + dy * ratio,
      });
    }

    circleLastPointRef.current = nextPoint;
    setCirclePoints((previous) => [...previous, ...interpolated]);
  }, []);

  const finishCircleDraw = useCallback(() => {
    setIsCircleDrawing(false);
    circleLastPointRef.current = null;
    setCirclePoints((previous) => {
      if (previous.length < 18) {
        setGameScore(0);
        setIsGameActive(false);
        return previous;
      }

      const distances = previous.map((point) => {
        const dx = point.x - 50;
        const dy = point.y - 50;
        return Math.sqrt(dx * dx + dy * dy);
      });

      const radius = distances.reduce((sum, value) => sum + value, 0) / distances.length;
      const meanError =
        distances.reduce((sum, value) => sum + Math.abs(value - radius), 0) /
        Math.max(1, distances.length * Math.max(1, radius));
      const score = Math.max(0, Math.min(100, Math.round((1 - meanError) * 100)));

      setGameScore(score);
      setIsGameActive(false);

      return previous;
    });
  }, []);

  const updateSurvivorMouse = useCallback(
    (clientX: number, clientY: number, element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 100;
      const y = ((clientY - rect.top) / rect.height) * 100;

      survivorRef.current.mouseX = x;
      survivorRef.current.mouseY = y;

      const hit = survivorShapes.some((shape) => {
        return (
          x >= shape.x && x <= shape.x + shape.width && y >= shape.y && y <= shape.y + shape.height
        );
      });

      if (hit) {
        setIsGameActive(false);
      }
    },
    [survivorShapes]
  );

  function onSaveTimerPreferences() {
    if (isLockedBySharedSession) {
      toast.error("Only the session owner can change shared timer values");
      return;
    }

    const workMin = clampDurationInput(workMinutesInput, 1, 90);
    const shortBreakMin = clampDurationInput(shortBreakMinutesInput, 1, 30);
    const longBreakMin = clampDurationInput(longBreakMinutesInput, 5, 60);

    setWorkMinutesInput(workMin);
    setShortBreakMinutesInput(shortBreakMin);
    setLongBreakMinutesInput(longBreakMin);

    startSavingPreferences(async () => {
      const result = await updatePomodoroPreferencesAction({
        workMin,
        shortBreakMin,
        longBreakMin,
      });

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      setDurations({
        workMinutes: workMin,
        shortBreakMinutes: shortBreakMin,
        longBreakMinutes: longBreakMin,
      });

      if (currentSession && isSessionOwner) {
        syncSharedTimerStateFromStore();
      }

      toast.success("Timer settings updated");
    });
  }

  function onStartTimer() {
    void playUiCue("play");
    start();
    if (currentSession && isSessionOwner) {
      syncSharedTimerStateFromStore();
    }
  }

  function onPauseTimer() {
    void playUiCue("pause");
    pause();
    if (currentSession && isSessionOwner) {
      syncSharedTimerStateFromStore();
    }
  }

  function onResumeTimer() {
    void playUiCue("play");
    resume();
    if (currentSession && isSessionOwner) {
      syncSharedTimerStateFromStore();
    }
  }

  function onSkipTimer() {
    skip();
    if (currentSession && isSessionOwner) {
      syncSharedTimerStateFromStore();
    }
  }

  function onResetTimer() {
    reset();
    if (currentSession && isSessionOwner) {
      syncSharedTimerStateFromStore();
    }
  }

  function onStartOwnSession() {
    const title = sessionTitleInput.trim();

    startUpdatingCollaboration(async () => {
      const result = await startOwnFocusSessionAction({
        title: title.length > 0 ? title : undefined,
        focusColor,
        breakColor,
        interpolatePhaseColors,
        autoStartBreaks,
        autoStartFocus,
      });

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      applyCollaborationSnapshot(result.snapshot);
      setSessionTitleInput("");
      toast.success("You started your own focus session");
    });
  }

  function onJoinSession(sessionId: string) {
    startUpdatingCollaboration(async () => {
      const result = await joinFocusSessionAction({ sessionId });

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      applyCollaborationSnapshot(result.snapshot);
      toast.success("Joined focus session");
    });
  }

  function onLeaveSession() {
    startUpdatingCollaboration(async () => {
      const result = await leaveFocusSessionAction();

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      applyCollaborationSnapshot(result.snapshot);
      pause();
      useTimerStore.setState((state) => ({
        ...state,
        phase: "work",
        secondsLeft: initialWorkMinutes * 60,
        sessionCount: 0,
        isRunning: false,
        targetEndsAt: null,
        intervalId: null,
        lastCompletedPhase: null,
        lastCompletedAt: null,
        lastCompletedDurationMin: null,
        completionCount: 0,
        durations: {
          workMinutes: initialWorkMinutes,
          shortBreakMinutes: initialShortBreakMinutes,
          longBreakMinutes: initialLongBreakMinutes,
        },
      }));
      toast.success("You left the focus session");
    });
  }

  function onAddMemberToSession() {
    if (!currentSession || !selectedInviteCandidateId) {
      return;
    }

    startUpdatingCollaboration(async () => {
      const result = await addUserToFocusSessionAction({
        sessionId: currentSession.id,
        userId: selectedInviteCandidateId,
      });

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      applyCollaborationSnapshot(result.snapshot);
      toast.success("Request sent");
    });
  }

  function onKickMember(userId: string) {
    if (!currentSession) {
      return;
    }

    startUpdatingCollaboration(async () => {
      const result = await kickFocusSessionMemberAction({
        sessionId: currentSession.id,
        userId,
      });

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      applyCollaborationSnapshot(result.snapshot);
      toast.success("Member removed from session");
    });
  }

  function onRespondToRequest(requestId: string, decision: "accept" | "decline") {
    startUpdatingCollaboration(async () => {
      const result = await respondToFocusSessionRequestAction({
        requestId,
        decision,
      });

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      applyCollaborationSnapshot(result.snapshot);
      toast.success(decision === "accept" ? "Request accepted" : "Request declined");
    });
  }

  const isOnBreak = isBreakPhase(phase);
  const totalPhaseSeconds = useMemo(() => {
    if (phase === "work") {
      return durations.workMinutes * 60;
    }

    if (phase === "shortBreak") {
      return durations.shortBreakMinutes * 60;
    }

    return durations.longBreakMinutes * 60;
  }, [durations.longBreakMinutes, durations.shortBreakMinutes, durations.workMinutes, phase]);

  const progressValue = (() => {
    if (totalPhaseSeconds <= 0) {
      return 0;
    }

    const totalPhaseMs = totalPhaseSeconds * 1000;

    let elapsedMs = (totalPhaseSeconds - displaySecondsLeft) * 1000;

    if (isLockedBySharedSession && currentSession?.sharedTimer?.isRunning) {
      const startedAtMs =
        currentSession.sharedTimer.startedAt !== null
          ? Date.parse(currentSession.sharedTimer.startedAt)
          : Number.NaN;

      if (!Number.isNaN(startedAtMs)) {
        const sharedRemainingMs = Math.max(
          0,
          currentSession.sharedTimer.secondsLeft * 1000 - (sharedTimerNow - startedAtMs)
        );
        elapsedMs = totalPhaseMs - sharedRemainingMs;
      }
    } else if (isRunning && targetEndsAt !== null) {
      const localRemainingMs = Math.max(0, targetEndsAt - runningNow);
      elapsedMs = totalPhaseMs - localRemainingMs;
    }

    return Math.max(0, Math.min(100, (elapsedMs / totalPhaseMs) * 100));
  })();

  const phaseProgress = useMemo(() => {
    return Math.max(0, Math.min(1, progressValue / 100));
  }, [progressValue]);

  const timerAccentColor = useMemo(() => {
    if (!interpolatePhaseColors) {
      return phase === "work" ? focusColor : breakColor;
    }

    if (phase === "work") {
      return mixHexColors(focusColor, breakColor, phaseProgress);
    }

    return mixHexColors(breakColor, focusColor, phaseProgress);
  }, [breakColor, focusColor, interpolatePhaseColors, phase, phaseProgress]);

  const timerCardStyle = useMemo(() => {
    return {
      backgroundImage: `linear-gradient(135deg, ${toRgba(timerAccentColor, 0.24)} 0%, ${toRgba(timerAccentColor, 0.08)} 55%, rgba(15, 23, 42, 0.03) 100%)`,
      borderColor: toRgba(timerAccentColor, 0.42),
      ["--primary" as string]: timerAccentColor,
    };
  }, [timerAccentColor]);

  const shouldResume = !isRunning && displaySecondsLeft < totalPhaseSeconds;
  const nextSessionNumber = (sessionCount % LONG_BREAK_CYCLE) + 1;
  const isCurrentUserSessionHost = Boolean(currentSession && isSessionOwner);
  const shouldRenderSettingsCard = !isLockedBySharedSession;
  const selectedInviteCandidateId =
    selectedInviteUserId &&
    collaboration.inviteCandidates.some((candidate) => candidate.id === selectedInviteUserId)
      ? selectedInviteUserId
      : (collaboration.inviteCandidates[0]?.id ?? "");

  const statsRangeCount = useMemo(() => {
    if (selectedStatsRange === "today") {
      return stats.todayCount;
    }

    if (selectedStatsRange === "week") {
      return stats.weekCount;
    }

    return stats.totalCount;
  }, [selectedStatsRange, stats.todayCount, stats.totalCount, stats.weekCount]);

  const statsRangeLabel =
    selectedStatsRange === "today"
      ? "Today"
      : selectedStatsRange === "week"
        ? "This week"
        : "Total";

  const statsFormatLabel = selectedStatsFormat === "bar" ? "Bar graph" : "Line graph";

  const cycleStatsRange = useCallback(() => {
    setSelectedStatsRange((current) => {
      if (current === "today") {
        return "week";
      }

      if (current === "week") {
        return "total";
      }

      return "today";
    });
  }, []);

  const cycleStatsFormat = useCallback(() => {
    setSelectedStatsFormat((current) => {
      if (current === "bar") {
        return "line";
      }

      return "bar";
    });
  }, []);

  const statsChartData = useMemo<StatsDatum[]>(() => {
    if (selectedStatsRange === "week") {
      return stats.last7Days.map((entry) => ({
        label: entry.label,
        value: entry.count,
      }));
    }

    return [];
  }, [selectedStatsRange, stats.last7Days]);

  const chartWidth = 320;
  const chartHeight = 152;
  const chartPaddingX = 18;
  const chartPaddingY = 14;
  const chartBaselineY = chartHeight - chartPaddingY;

  const chartMaxValue = useMemo(() => {
    return Math.max(1, ...statsChartData.map((entry) => entry.value));
  }, [statsChartData]);

  const chartPoints = useMemo(() => {
    const spanX = chartWidth - chartPaddingX * 2;
    const drawableHeight = chartHeight - chartPaddingY * 2;

    return statsChartData.map((entry, index) => {
      const x =
        statsChartData.length === 1
          ? chartWidth / 2
          : chartPaddingX + (spanX * index) / (statsChartData.length - 1);
      const y = chartBaselineY - (entry.value / chartMaxValue) * drawableHeight;

      return {
        x,
        y,
        value: entry.value,
      };
    });
  }, [chartBaselineY, chartHeight, chartMaxValue, statsChartData]);

  const linePath = useMemo(() => {
    if (chartPoints.length === 0) {
      return "";
    }

    return chartPoints
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
      .join(" ");
  }, [chartPoints]);

  const joinableSessions = collaboration.activeSessions.filter(
    (session) => session.id !== currentSession?.id
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <Card
          className="border-border/70 bg-background/85 rounded-3xl shadow-none"
          style={timerCardStyle}
        >
          <CardHeader className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-2xl tracking-tight">{phaseLabel(phase)}</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  Session {nextSessionNumber} of {LONG_BREAK_CYCLE}
                </Badge>
                {isPersistingSession ? <Badge variant="outline">Saving session…</Badge> : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="text-center text-6xl font-semibold tabular-nums">
                {formatClock(displaySecondsLeft)}
              </div>
              <Progress value={progressValue} className="h-3" />
            </div>

            {!isLockedBySharedSession ? (
              <div className="flex flex-wrap gap-2">
                {isRunning ? (
                  <Button
                    type="button"
                    onClick={onPauseTimer}
                    className="gap-2"
                    disabled={isLockedBySharedSession}
                  >
                    <Pause className="size-4" />
                    Pause
                  </Button>
                ) : shouldResume ? (
                  <Button
                    type="button"
                    onClick={onResumeTimer}
                    className="gap-2"
                    disabled={isLockedBySharedSession}
                  >
                    <Play className="size-4" />
                    Resume
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={onStartTimer}
                    className="gap-2"
                    disabled={isLockedBySharedSession}
                  >
                    <Play className="size-4" />
                    Start
                  </Button>
                )}

                <Button
                  type="button"
                  variant="outline"
                  onClick={onSkipTimer}
                  className="gap-2"
                  disabled={isLockedBySharedSession}
                >
                  <SkipForward className="size-4" />
                  Skip
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  onClick={onResetTimer}
                  className="gap-2"
                  disabled={isLockedBySharedSession}
                >
                  <RotateCcw className="size-4" />
                  Reset
                </Button>
              </div>
            ) : null}

            <div className="text-muted-foreground flex flex-wrap gap-4 text-xs">
              <span>Work: {durations.workMinutes}m</span>
              <span>Short break: {durations.shortBreakMinutes}m</span>
              <span>Long break: {durations.longBreakMinutes}m</span>
            </div>
          </CardContent>
        </Card>

        {shouldRenderSettingsCard ? (
          <Card className="border-border/70 bg-background/85 rounded-3xl shadow-none">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">Timer settings</CardTitle>
                {isCurrentUserSessionHost ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1"
                    onClick={() => {
                      setShowTimerSettings((value) => !value);
                    }}
                  >
                    {showTimerSettings ? "Collapse" : "Expand"}
                    <ChevronDown
                      className={`size-4 transition-transform ${showTimerSettings ? "rotate-180" : "rotate-0"}`}
                    />
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            {showTimerSettings ? (
              <CardContent className="space-y-4">
                <p className="text-muted-foreground text-sm">
                  Configure your work and break durations directly from this page.
                </p>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="timer-work-minutes">Work</Label>
                    <Input
                      id="timer-work-minutes"
                      type="number"
                      min={1}
                      max={90}
                      value={workMinutesInput}
                      disabled={isLockedBySharedSession}
                      onChange={(event) => {
                        setWorkMinutesInput(Number.parseInt(event.target.value, 10) || 0);
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="timer-short-break-minutes">Short break</Label>
                    <Input
                      id="timer-short-break-minutes"
                      type="number"
                      min={1}
                      max={30}
                      value={shortBreakMinutesInput}
                      disabled={isLockedBySharedSession}
                      onChange={(event) => {
                        setShortBreakMinutesInput(Number.parseInt(event.target.value, 10) || 0);
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="timer-long-break-minutes">Long break</Label>
                    <Input
                      id="timer-long-break-minutes"
                      type="number"
                      min={5}
                      max={60}
                      value={longBreakMinutesInput}
                      disabled={isLockedBySharedSession}
                      onChange={(event) => {
                        setLongBreakMinutesInput(Number.parseInt(event.target.value, 10) || 0);
                      }}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="timer-focus-color">Focus color</Label>
                    <Input
                      id="timer-focus-color"
                      type="color"
                      value={focusColor}
                      disabled={isLockedBySharedSession}
                      onChange={(event) => {
                        setFocusColor(normalizeHexColor(event.target.value, DEFAULT_FOCUS_COLOR));
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="timer-break-color">Break color</Label>
                    <Input
                      id="timer-break-color"
                      type="color"
                      value={breakColor}
                      disabled={isLockedBySharedSession}
                      onChange={(event) => {
                        setBreakColor(normalizeHexColor(event.target.value, DEFAULT_BREAK_COLOR));
                      }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-xl border px-3 py-2">
                  <input
                    id="timer-color-interpolation"
                    type="checkbox"
                    checked={interpolatePhaseColors}
                    disabled={isLockedBySharedSession}
                    onChange={(event) => {
                      setInterpolatePhaseColors(event.target.checked);
                    }}
                    className="size-4"
                  />
                  <Label htmlFor="timer-color-interpolation" className="text-sm font-normal">
                    Interpolate between focus and break colors as the timer counts down
                  </Label>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex items-center gap-3 rounded-xl border px-3 py-2">
                    <input
                      id="timer-auto-start-breaks"
                      type="checkbox"
                      checked={autoStartBreaks}
                      disabled={isLockedBySharedSession}
                      onChange={(event) => {
                        setAutoStartBreaks(event.target.checked);
                      }}
                      className="size-4"
                    />
                    <span className="text-sm">Auto-start breaks</span>
                  </label>

                  <label className="flex items-center gap-3 rounded-xl border px-3 py-2">
                    <input
                      id="timer-auto-start-focus"
                      type="checkbox"
                      checked={autoStartFocus}
                      disabled={isLockedBySharedSession}
                      onChange={(event) => {
                        setAutoStartFocus(event.target.checked);
                      }}
                      className="size-4"
                    />
                    <span className="text-sm">Auto-start focus</span>
                  </label>
                </div>

                <Button
                  type="button"
                  onClick={onSaveTimerPreferences}
                  disabled={isSavingPreferences || isLockedBySharedSession}
                >
                  {isSavingPreferences ? "Saving..." : "Save timer settings"}
                </Button>
              </CardContent>
            ) : null}
          </Card>
        ) : null}

        {isOnBreak ? (
          <Card className="border-border/70 bg-background/85 rounded-3xl shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Break minigame</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(MINIGAME_CONFIG) as MinigameId[]).map((gameId) => (
                  <Button
                    key={gameId}
                    type="button"
                    variant={selectedMinigame === gameId ? "default" : "outline"}
                    size="sm"
                    disabled={isGameActive}
                    onClick={() => {
                      setSelectedMinigame(gameId);
                    }}
                  >
                    {MINIGAME_CONFIG[gameId].label}
                  </Button>
                ))}
              </div>

              {!isGameActive ? (
                <Button type="button" variant="outline" className="gap-2" onClick={startMinigame}>
                  <Gamepad2 className="size-4" />
                  Play {MINIGAME_CONFIG[selectedMinigame].label}
                </Button>
              ) : null}

              {isGameActive ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{MINIGAME_CONFIG[activeMinigame].label}</span>
                    <span className="text-muted-foreground">
                      {MINIGAME_CONFIG[activeMinigame].scoreLabel}: {gameScore}
                    </span>
                  </div>

                  {activeMinigame === "aim" ? (
                    <AimMinigame
                      targetPosition={targetPosition}
                      onHitTarget={() => {
                        setGameScore((value) => value + 1);
                        setTargetPosition(randomGamePosition());
                      }}
                    />
                  ) : null}

                  {activeMinigame === "dino" ? (
                    <DinoMinigame
                      dinoJumping={dinoJumping}
                      dinoObstacleX={dinoObstacleX}
                      onJump={jumpDino}
                    />
                  ) : null}

                  {activeMinigame === "bricks" ? (
                    <BricksMinigame
                      bricks={bricks}
                      brickBall={brickBall}
                      brickPaddleX={brickPaddleX}
                      onMouseMoveArena={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        const relative = (event.clientX - rect.left) / rect.width;
                        moveBrickPaddle(relative * 100);
                      }}
                    />
                  ) : null}

                  {activeMinigame === "flappy" ? (
                    <FlappyArrowMinigame
                      flappyPipeX={flappyPipeX}
                      flappyGapY={flappyGapY}
                      flappyArrowY={flappyArrowY}
                      onFlap={flapArrow}
                    />
                  ) : null}

                  {activeMinigame === "typing" ? (
                    <TypingSprintMinigame
                      sourceText={SHAKESPEARE_SNIPPET.repeat(4)}
                      typingValue={typingValue}
                      onTypingChange={handleTypingChange}
                    />
                  ) : null}

                  {activeMinigame === "circle" ? (
                    <CircleDrawMinigame
                      circlePoints={circlePoints}
                      onStartDraw={(clientX, clientY, element) => {
                        beginCircleDraw();
                        addCirclePoint(clientX, clientY, element);
                      }}
                      onContinueDraw={(clientX, clientY, element) => {
                        if (!isCircleDrawing) {
                          return;
                        }

                        addCirclePoint(clientX, clientY, element);
                      }}
                      onEndDraw={finishCircleDraw}
                    />
                  ) : null}

                  {activeMinigame === "survivor" ? (
                    <CursorSurvivorMinigame
                      survivorShapes={survivorShapes}
                      onMouseMoveArena={(event) => {
                        updateSurvivorMouse(event.clientX, event.clientY, event.currentTarget);
                      }}
                    />
                  ) : null}
                </div>
              ) : null}

              {lastBreakScore !== null ? (
                <div className="space-y-1 text-sm">
                  <p className="font-medium">Last break score: {lastBreakScore}</p>
                  <p className="text-muted-foreground">
                    All-time score: {currentLeaderboardEntry?.allTimeScore ?? 0}
                  </p>
                </div>
              ) : null}

              {isSavingMinigameScore ? (
                <p className="text-muted-foreground text-xs">Updating leaderboard...</p>
              ) : null}

              <ChampionsList champions={champions} />
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className="space-y-6">
        <Card className="border-border/70 bg-background/85 rounded-3xl shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Session collaboration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {currentSession ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{currentSession.title}</p>
                  <p className="text-muted-foreground text-xs">Owner: {currentSession.ownerName}</p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium tracking-[0.2em] uppercase">Members</p>
                  {currentSession.members.map((member) => (
                    <div
                      key={member.userId}
                      className="flex items-center justify-between rounded-lg border px-2 py-1.5 text-sm"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <Avatar size="sm" className="shrink-0">
                          <AvatarImage
                            src={member.avatarUrl ?? undefined}
                            alt={getDisplayName(member.name, member.email)}
                          />
                          <AvatarFallback>
                            {initialsFromName(member.name, member.email)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate">
                          {getDisplayName(member.name, member.email)}
                          {member.userId === currentUserId ? " (You)" : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {member.isOwner ? <Badge variant="outline">Owner</Badge> : null}
                        {isSessionOwner && !member.isOwner ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isUpdatingCollaboration}
                            onClick={() => {
                              onKickMember(member.userId);
                            }}
                          >
                            Kick
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Input
                    value={sessionTitleInput}
                    onChange={(event) => {
                      setSessionTitleInput(event.target.value);
                    }}
                    maxLength={80}
                    placeholder="Session title (optional)"
                    disabled={isUpdatingCollaboration}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onLeaveSession}
                    disabled={isUpdatingCollaboration}
                    className="gap-2"
                  >
                    <DoorOpen className="size-4" />
                    Leave
                  </Button>

                  <Button
                    type="button"
                    variant="secondary"
                    onClick={onStartOwnSession}
                    disabled={isUpdatingCollaboration}
                    className="gap-2"
                  >
                    <Users className="size-4" />
                    Start my own
                  </Button>
                </div>

                {currentSession.ownerId === currentUserId ? (
                  <div className="space-y-2 rounded-xl border p-3">
                    <p className="text-xs font-medium tracking-[0.2em] uppercase">Add people</p>
                    {collaboration.inviteCandidates.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={selectedInviteCandidateId}
                          onChange={(event) => {
                            setSelectedInviteUserId(event.target.value);
                          }}
                          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                        >
                          {collaboration.inviteCandidates.map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {getDisplayName(candidate.name, candidate.email)}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          onClick={onAddMemberToSession}
                          disabled={isUpdatingCollaboration || !selectedInviteCandidateId}
                          className="gap-2"
                        >
                          <UserPlus className="size-4" />
                          Send request
                        </Button>
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-sm">
                        No additional members available.
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-muted-foreground text-sm">
                  You are not currently in a shared focus session.
                </p>
                <Input
                  value={sessionTitleInput}
                  onChange={(event) => {
                    setSessionTitleInput(event.target.value);
                  }}
                  maxLength={80}
                  placeholder="Session title (optional)"
                  disabled={isUpdatingCollaboration}
                />
                <Button
                  type="button"
                  onClick={onStartOwnSession}
                  disabled={isUpdatingCollaboration}
                  className="gap-2"
                >
                  <Users className="size-4" />
                  Start my own session
                </Button>
              </div>
            )}

            {incomingRequests.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium tracking-[0.2em] uppercase">Requests for you</p>
                {incomingRequests.map((request) => (
                  <div
                    key={request.id}
                    className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{request.sessionTitle}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        From {getDisplayName(request.requesterName, request.requesterEmail)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={isUpdatingCollaboration}
                        onClick={() => {
                          onRespondToRequest(request.id, "accept");
                        }}
                      >
                        Accept
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isUpdatingCollaboration}
                        onClick={() => {
                          onRespondToRequest(request.id, "decline");
                        }}
                      >
                        Decline
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {outgoingRequests.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium tracking-[0.2em] uppercase">Outgoing requests</p>
                {outgoingRequests.map((request) => (
                  <div
                    key={request.id}
                    className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{request.sessionTitle}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        To {getDisplayName(request.targetName, request.targetEmail)}
                      </p>
                    </div>
                    <Badge variant="outline">Pending</Badge>
                  </div>
                ))}
              </div>
            ) : null}

            {joinableSessions.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium tracking-[0.2em] uppercase">
                  Join active sessions
                </p>
                {joinableSessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{session.title}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {session.memberCount} member{session.memberCount === 1 ? "" : "s"} · Owner{" "}
                        {session.ownerName}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isUpdatingCollaboration}
                      onClick={() => {
                        onJoinSession(session.id);
                      }}
                    >
                      Join
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-background/85 rounded-3xl shadow-none">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Session stats</CardTitle>
              <Button type="button" size="sm" variant="outline" onClick={cycleStatsRange}>
                Change time: {statsRangeLabel}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="rounded-2xl border p-3">
              <p className="text-muted-foreground text-xs tracking-[0.2em] uppercase">
                {statsRangeLabel}
              </p>
              <p className="text-2xl font-semibold tabular-nums">{statsRangeCount}</p>
            </div>

            {selectedStatsRange === "week" ? (
              <div className="rounded-2xl border p-3">
                <svg
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  className="h-44 w-full"
                  role="img"
                  aria-label={`Session stats ${selectedStatsFormat} chart for ${selectedStatsRange}`}
                >
                  <line
                    x1={chartPaddingX}
                    y1={chartBaselineY}
                    x2={chartWidth - chartPaddingX}
                    y2={chartBaselineY}
                    stroke="currentColor"
                    strokeOpacity="0.25"
                  />

                  {selectedStatsFormat === "bar"
                    ? chartPoints.map((point, index) => {
                        const slotWidth =
                          (chartWidth - chartPaddingX * 2) / Math.max(1, chartPoints.length);
                        const barWidth = Math.min(28, slotWidth * 0.6);
                        const x = chartPaddingX + index * slotWidth + (slotWidth - barWidth) / 2;
                        const height = Math.max(2, chartBaselineY - point.y);

                        return (
                          <rect
                            key={`${statsChartData[index]?.label ?? "bar"}-${index}`}
                            x={x}
                            y={chartBaselineY - height}
                            width={barWidth}
                            height={height}
                            rx={4}
                            fill="currentColor"
                            fillOpacity="0.8"
                          />
                        );
                      })
                    : null}

                  {selectedStatsFormat === "line" && linePath ? (
                    <path
                      d={linePath}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : null}

                  {selectedStatsFormat !== "bar"
                    ? chartPoints.map((point, index) => (
                        <circle
                          key={`${statsChartData[index]?.label ?? "point"}-${index}`}
                          cx={point.x}
                          cy={point.y}
                          r={4}
                          fill="currentColor"
                        />
                      ))
                    : null}
                </svg>

                <div className="text-muted-foreground mt-1 flex">
                  {statsChartData.map((entry) => (
                    <span key={entry.label} className="flex-1 text-center text-xs">
                      {entry.label}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {selectedStatsRange === "week" ? (
              <div className="flex justify-center">
                <Button type="button" size="sm" variant="outline" onClick={cycleStatsFormat}>
                  Change format: {statsFormatLabel}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-background/85 rounded-3xl shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Minigame leaderboard (all-time)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {leaderboard.entries.length > 0 ? (
              leaderboard.entries.map((entry) => (
                <div
                  key={entry.userId}
                  className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      #{entry.rank} {getDisplayName(entry.name, entry.email)}
                      {entry.userId === currentUserId ? " (You)" : ""}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      Best {entry.bestScore} · Plays {entry.plays}
                    </p>
                  </div>
                  <Badge variant={entry.userId === currentUserId ? "default" : "secondary"}>
                    {entry.allTimeScore}
                  </Badge>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-sm">
                No scores yet. Play during a break to create the first all-time entry.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
