"use client";

import { useEffect, useEffectEvent, type CSSProperties } from "react";
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { LONG_BREAK_CYCLE, type TimerPhase } from "@/stores/timer-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
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
  const announcement = `${phaseLabel(phase)} ${isRunning ? "running" : canResume ? "paused" : "ready"}`;
  const sessionText = isBreakPhase(phase)
    ? `Up next: session ${sessionNumber} of ${LONG_BREAK_CYCLE}`
    : `Session ${sessionNumber} of ${LONG_BREAK_CYCLE}`;

  return (
    <Card className="border-border/70 bg-background/85 rounded-3xl shadow-none" style={style}>
      <CardHeader className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CardTitle id="timer-phase-label" className="text-2xl tracking-tight">
              {phaseLabel(phase)}
            </CardTitle>
            {isRunning ? (
              <span
                aria-hidden="true"
                className="bg-primary size-2.5 rounded-full motion-safe:animate-pulse"
              />
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <Badge
              variant="outline"
              role="status"
              className={cn(!isSaving && "invisible max-sm:hidden")}
              aria-hidden={!isSaving}
            >
              Saving session…
            </Badge>
            <span className="text-foreground/80 text-xs sm:text-sm">{sessionText}</span>
            <div aria-hidden="true" className="flex items-center gap-1.5">
              {Array.from({ length: LONG_BREAK_CYCLE }, (_, index) => (
                <div
                  key={index}
                  className={cn(
                    "size-2.5 rounded-full transition-colors",
                    index < sessionNumber - 1
                      ? "bg-primary"
                      : index === sessionNumber - 1
                        ? "ring-primary ring-2 ring-inset"
                        : "bg-muted-foreground/25"
                  )}
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
            className="text-center text-6xl font-semibold tabular-nums sm:text-7xl lg:text-8xl"
          >
            {formatClock(secondsLeft)}
          </div>
          <p role="status" className="sr-only">
            {announcement}
          </p>
          <Progress
            value={progressValue}
            aria-label="Phase progress"
            className="bg-foreground/15 ring-foreground/25 h-3 ring-1 ring-inset"
          />
        </div>

        {controlledBy ? (
          <p className="text-muted-foreground text-center text-sm">
            Controlled by {controlledBy}. Only the host can start, pause, skip or reset.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:justify-center">
            {isRunning ? (
              <Button
                type="button"
                size="lg"
                onClick={onPause}
                title="Shortcut: Space"
                className="min-h-11 w-full gap-2 sm:w-auto sm:min-w-28"
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
                title="Shortcut: Space"
                className="min-h-11 w-full gap-2 sm:w-auto sm:min-w-28"
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
                title="Shortcut: Space"
                className="min-h-11 w-full gap-2 sm:w-auto sm:min-w-28"
                aria-keyshortcuts="Space"
              >
                <Play className="size-4" />
                Start
              </Button>
            )}

            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={onSkip}
              className="min-h-11 w-full gap-2 sm:w-auto"
            >
              <SkipForward className="size-4" />
              Skip
            </Button>

            <Button
              type="button"
              size="lg"
              variant="ghost"
              onClick={onReset}
              className="min-h-11 w-full gap-2 sm:w-auto"
            >
              <RotateCcw className="size-4" />
              Reset
            </Button>
          </div>
        )}

        <p className="text-muted-foreground mt-2 text-center text-sm">
          Up next: {next.label} · {next.minutes} min
        </p>
      </CardContent>
    </Card>
  );
}
