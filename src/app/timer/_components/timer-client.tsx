"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  addUserToFocusSessionAction,
  joinFocusSessionAction,
  kickFocusSessionMemberAction,
  leaveFocusSessionAction,
  recordPomodoroSessionAction,
  refreshPomodoroCollaborationAction,
  respondToFocusSessionRequestAction,
  startOwnFocusSessionAction,
  updatePomodoroPreferencesAction,
  syncFocusSessionTimerStateAction,
} from "@/app/actions/pomodoro";
import type { PomodoroCollaborationSnapshot, PomodoroStatsSnapshot } from "@/lib/pomodoro";
import { LONG_BREAK_CYCLE, useTimerStore } from "@/stores/timer-store";
import { createClient } from "@/lib/supabase/client";
import {
  clampDurationInput,
  DURATION_LIMITS,
  formatClock,
  incrementStats,
  isBreakPhase,
  mixHexColors,
  phaseLabel,
  readableTextColor,
  toRgba,
} from "./timer-utils";
import { playCompletionTone, playUiCue } from "./timer-audio";
import { useTimerPrefs, writeTimerPrefs } from "./timer-prefs";
import { FocusTimerCard } from "./focus-timer-card";
import { SessionCollaborationCard } from "./session-collaboration-card";
import { SessionStatsCard } from "./session-stats-card";
import { TimerSettingsCard, type TimerPrefs } from "./timer-settings-card";

interface TimerClientProps {
  currentUserId: string;
  initialWorkMinutes: number;
  initialShortBreakMinutes: number;
  initialLongBreakMinutes: number;
  initialStats: PomodoroStatsSnapshot;
  initialCollaboration: PomodoroCollaborationSnapshot;
}

const COLLABORATION_SYNC_INTERVAL_MS = 4000;

export function TimerClient({
  currentUserId,
  initialWorkMinutes,
  initialShortBreakMinutes,
  initialLongBreakMinutes,
  initialStats,
  initialCollaboration,
}: TimerClientProps) {
  const [stats, setStats] = useState(initialStats);
  const [collaboration, setCollaboration] = useState(initialCollaboration);
  const [isPersistingSession, startPersistingSession] = useTransition();
  const [isSavingPreferences, startSavingPreferences] = useTransition();
  const [isUpdatingCollaboration, startUpdatingCollaboration] = useTransition();

  const [workMinutesInput, setWorkMinutesInput] = useState(() => initialWorkMinutes);
  const [shortBreakMinutesInput, setShortBreakMinutesInput] = useState(
    () => initialShortBreakMinutes
  );
  const [longBreakMinutesInput, setLongBreakMinutesInput] = useState(() => initialLongBreakMinutes);
  const [sessionTitleInput, setSessionTitleInput] = useState("");
  const timerPrefs = useTimerPrefs();
  const { focusColor, breakColor, interpolatePhaseColors, autoStartBreaks, autoStartFocus } =
    timerPrefs;

  const [sharedTimerNow, setSharedTimerNow] = useState(() => Date.now());
  const [runningNow, setRunningNow] = useState(() => Date.now());

  const handledCompletionRef = useRef(0);

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
        lastCompletedSet: state.lastCompletedSet,
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
    const isSharedRunning = isLockedBySharedSession && currentSession?.sharedTimer?.isRunning;
    if (!isRunning && !isSharedRunning) {
      document.title = "Focus timer";
      return () => {
        document.title = "Focus timer";
      };
    }
    document.title = `${formatClock(displaySecondsLeft)} · ${phaseLabel(phase)}`;
    return () => {
      document.title = "Focus timer";
    };
  }, [
    displaySecondsLeft,
    isRunning,
    phase,
    isLockedBySharedSession,
    currentSession?.sharedTimer?.isRunning,
  ]);

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

    if (lastCompletedPhase === "work" && lastCompletedDurationMin) {
      startPersistingSession(async () => {
        const result = await recordPomodoroSessionAction({
          durationMin: lastCompletedDurationMin,
          completedSet: useTimerStore.getState().lastCompletedSet,
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
    autoStartBreaks,
    autoStartFocus,
    completionCount,
    lastCompletedDurationMin,
    lastCompletedPhase,
    start,
    startPersistingSession,
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
            completedSet: sharedTimer.lastCompletedSet,
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

  function onSaveTimerPreferences() {
    if (isLockedBySharedSession) {
      toast.error("Only the session owner can change shared timer values");
      return;
    }

    const workMin = clampDurationInput(
      workMinutesInput,
      DURATION_LIMITS.workMinutes.min,
      DURATION_LIMITS.workMinutes.max
    );
    const shortBreakMin = clampDurationInput(
      shortBreakMinutesInput,
      DURATION_LIMITS.shortBreakMinutes.min,
      DURATION_LIMITS.shortBreakMinutes.max
    );
    const longBreakMin = clampDurationInput(
      longBreakMinutesInput,
      DURATION_LIMITS.longBreakMinutes.min,
      DURATION_LIMITS.longBreakMinutes.max
    );

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

  function onTimerPrefsChange(patch: Partial<TimerPrefs>) {
    writeTimerPrefs({ ...timerPrefs, ...patch });
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
        setSkipped: false,
        lastCompletedSet: false,
        durations: {
          workMinutes: initialWorkMinutes,
          shortBreakMinutes: initialShortBreakMinutes,
          longBreakMinutes: initialLongBreakMinutes,
        },
      }));
      toast.success("You left the focus session");
    });
  }

  function onAddMemberToSession(userId: string) {
    if (!currentSession || !userId) {
      return;
    }

    startUpdatingCollaboration(async () => {
      const result = await addUserToFocusSessionAction({
        sessionId: currentSession.id,
        userId,
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
      ["--primary-foreground" as string]: readableTextColor(timerAccentColor),
    };
  }, [timerAccentColor]);

  const shouldResume = !isRunning && displaySecondsLeft < totalPhaseSeconds;
  const nextSessionNumber = (sessionCount % LONG_BREAK_CYCLE) + 1;
  const shouldRenderSettingsCard = !isLockedBySharedSession;

  const joinableSessions = collaboration.activeSessions.filter(
    (session) => session.id !== currentSession?.id
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <FocusTimerCard
          phase={phase}
          secondsLeft={displaySecondsLeft}
          progressValue={progressValue}
          isRunning={isRunning}
          canResume={shouldResume}
          sessionNumber={nextSessionNumber}
          durations={durations}
          isSaving={isPersistingSession}
          controlledBy={isLockedBySharedSession ? (currentSession?.ownerName ?? "the host") : null}
          style={timerCardStyle}
          onStart={onStartTimer}
          onPause={onPauseTimer}
          onResume={onResumeTimer}
          onSkip={onSkipTimer}
          onReset={onResetTimer}
        />

        {shouldRenderSettingsCard ? (
          <TimerSettingsCard
            saved={durations}
            draft={{
              workMinutes: workMinutesInput,
              shortBreakMinutes: shortBreakMinutesInput,
              longBreakMinutes: longBreakMinutesInput,
            }}
            onDraftChange={(field, value) => {
              if (field === "workMinutes") setWorkMinutesInput(value);
              else if (field === "shortBreakMinutes") setShortBreakMinutesInput(value);
              else setLongBreakMinutesInput(value);
            }}
            onSave={onSaveTimerPreferences}
            isSaving={isSavingPreferences}
            prefs={timerPrefs}
            onPrefsChange={onTimerPrefsChange}
          />
        ) : null}
      </div>

      <div className="space-y-6">
        <SessionCollaborationCard
          key={currentSession?.id ?? "none"}
          currentUserId={currentUserId}
          currentSession={currentSession}
          joinableSessions={joinableSessions}
          inviteCandidates={collaboration.inviteCandidates}
          incomingRequests={incomingRequests}
          outgoingRequests={outgoingRequests}
          isBusy={isUpdatingCollaboration}
          titleInput={sessionTitleInput}
          onTitleChange={setSessionTitleInput}
          onStartOwn={onStartOwnSession}
          onJoin={onJoinSession}
          onLeave={onLeaveSession}
          onAddMember={onAddMemberToSession}
          onKick={onKickMember}
          onRespond={onRespondToRequest}
        />

        <SessionStatsCard stats={stats} />
      </div>
    </div>
  );
}
