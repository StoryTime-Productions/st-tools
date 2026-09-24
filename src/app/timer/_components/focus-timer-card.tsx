"use client";

import { useEffect, useEffectEvent, type CSSProperties } from "react";
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { LONG_BREAK_CYCLE, type TimerPhase } from "@/stores/timer-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatClock, isBreakPhase, phaseLabel } from "./timer-utils";

interface FocusTimerCardProps {
  phase: TimerPhase;
  secondsLeft: number;
  progressValue: number;
  isRunning: boolean;
  canResume: boolean;
  sessionNumber: number;
  durations: { workMinutes: number; shortBreakMinutes: number; longBreakMinutes: number };
  isSaving: boolean;
  controlledBy: string | null;
  style: CSSProperties;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onReset: () => void;
}

// Space already activates these natively; the shortcut must not double-fire.
const INTERACTIVE_SELECTOR =
  'input, textarea, select, button, a[href], summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="menuitem"], [role="checkbox"], [role="switch"], [role="option"], [role="tab"]';

function describeNext(
  phase: TimerPhase,
  sessionNumber: number,
  durations: FocusTimerCardProps["durations"]
) {
  if (isBreakPhase(phase)) {
    return { label: "Focus", minutes: durations.workMinutes };
  }

  return sessionNumber === LONG_BREAK_CYCLE
    ? { label: "Long break", minutes: durations.longBreakMinutes }
    : { label: "Short break", minutes: durations.shortBreakMinutes };
}

export function FocusTimerCard({
  phase,
  secondsLeft,
  progressValue,
  isRunning,
  canResume,
  sessionNumber,
  durations,
  isSaving,
  controlledBy,
  style,
  onStart,
  onPause,
  onResume,
  onSkip,
  onReset,
}: FocusTimerCardProps) {
  const onSpace = useEffectEvent((event: KeyboardEvent) => {
    if (
      controlledBy ||
      event.code !== "Space" ||
      event.repeat ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      (event.target instanceof Element && event.target.closest(INTERACTIVE_SELECTOR))
    ) {
      return;
    }

    event.preventDefault();
    if (isRunning) onPause();
    else if (canResume) onResume();
    else onStart();
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onSpace(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const next = describeNext(phase, sessionNumber, durations);
  const sessionText = isBreakPhase(phase)
    ? `Session ${sessionNumber} of ${LONG_BREAK_CYCLE} next`
    : `Session ${sessionNumber} of ${LONG_BREAK_CYCLE}`;

  return (
    <Card className="border-border/70 bg-background/85 rounded-3xl shadow-none" style={style}>
      <CardHeader className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle id="timer-phase-label" className="text-2xl tracking-tight">
            {phaseLabel(phase)}
          </CardTitle>
          <div className="flex items-center gap-3">
            {isSaving ? <Badge variant="outline">Saving session…</Badge> : null}
            <span className="text-muted-foreground text-xs">{sessionText}</span>
            <div aria-hidden="true" className="flex items-center gap-1.5">
              {Array.from({ length: LONG_BREAK_CYCLE }, (_, index) => (
                <div
                  key={index}
                  className={`size-2.5 rounded-full transition-colors ${index < sessionNumber ? "bg-primary" : "bg-muted-foreground/25"}`}
                />
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div
            role="timer"
            aria-labelledby="timer-phase-label"
            className="text-center text-6xl font-semibold tabular-nums"
          >
            {formatClock(secondsLeft)}
          </div>
          <Progress value={progressValue} aria-label="Phase progress" className="h-3" />
        </div>

        {controlledBy ? (
          <p className="text-muted-foreground text-center text-sm">Controlled by {controlledBy}</p>
        ) : (
          <div className="flex flex-wrap justify-center gap-2">
            {isRunning ? (
              <Button
                type="button"
                size="lg"
                onClick={onPause}
                className="gap-2"
                aria-keyshortcuts="Space"
              >
                <Pause className="size-4" />
                Pause
              </Button>
            ) : canResume ? (
              <Button
                type="button"
                size="lg"
                onClick={onResume}
                className="gap-2"
                aria-keyshortcuts="Space"
              >
                <Play className="size-4" />
                Resume
              </Button>
            ) : (
              <Button
                type="button"
                size="lg"
                onClick={onStart}
                className="gap-2"
                aria-keyshortcuts="Space"
              >
                <Play className="size-4" />
                Start
              </Button>
            )}

            <Button type="button" size="lg" variant="outline" onClick={onSkip} className="gap-2">
              <SkipForward className="size-4" />
              Skip
            </Button>

            <Button type="button" size="lg" variant="ghost" onClick={onReset} className="gap-2">
              <RotateCcw className="size-4" />
              Reset
            </Button>
          </div>
        )}

        <p className="text-muted-foreground text-center text-sm">
          Up next: {next.label} · {next.minutes} min
        </p>
      </CardContent>
    </Card>
  );
}
