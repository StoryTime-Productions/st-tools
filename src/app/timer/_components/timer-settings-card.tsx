"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { ChevronDown, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { playCompletionTone } from "./timer-audio";
import { DURATION_LIMITS } from "./timer-utils";

export type DurationField = keyof typeof DURATION_LIMITS;
export type Durations = Record<DurationField, number>;

export interface TimerPrefs {
  focusColor: string;
  breakColor: string;
  interpolatePhaseColors: boolean;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  soundEnabled: boolean;
  notificationsEnabled: boolean;
}

interface TimerSettingsCardProps {
  saved: Durations;
  draft: Durations;
  onDraftChange: (field: DurationField, value: number) => void;
  onSave: () => void;
  isSaving: boolean;
  prefs: TimerPrefs;
  onPrefsChange: (patch: Partial<TimerPrefs>) => void;
  durationsLockedBy?: string | null;
}

const DURATION_FIELDS: { field: DurationField; label: string; id: string }[] = [
  { field: "workMinutes", label: "Work", id: "timer-work-minutes" },
  { field: "shortBreakMinutes", label: "Short break", id: "timer-short-break-minutes" },
  { field: "longBreakMinutes", label: "Long break", id: "timer-long-break-minutes" },
];

const BEHAVIOR_TOGGLES: {
  key: "autoStartBreaks" | "autoStartFocus" | "soundEnabled" | "notificationsEnabled";
  label: string;
  hint: string;
}[] = [
  {
    key: "autoStartBreaks",
    label: "Auto-start breaks",
    hint: "Begin the break as soon as focus ends",
  },
  {
    key: "autoStartFocus",
    label: "Auto-start focus",
    hint: "Jump back into focus after a break",
  },
  { key: "soundEnabled", label: "Sound cues", hint: "Play a chime when the phase changes" },
  {
    key: "notificationsEnabled",
    label: "Browser notifications",
    hint: "Show a notification when the phase changes, even without sound",
  },
];

const COLOR_FIELDS: { id: string; label: string; key: "focusColor" | "breakColor" }[] = [
  { id: "timer-focus-color", label: "Focus color", key: "focusColor" },
  { id: "timer-break-color", label: "Break color", key: "breakColor" },
];

function isValid(field: DurationField, value: number) {
  const { min, max } = DURATION_LIMITS[field];
  return Number.isInteger(value) && value >= min && value <= max;
}

function Toggle({
  id,
  label,
  hint,
  checked,
  onChange,
  disabled = false,
  action,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className="group relative flex min-h-11 items-center justify-between gap-4 py-3">
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-describedby={`${id}-hint`}
        onChange={(event) => onChange(event.target.checked)}
        className="absolute inset-0 z-0 m-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
      <div className="pointer-events-none min-w-0">
        <Label
          htmlFor={id}
          className={cn("text-sm font-medium", disabled && "text-muted-foreground")}
        >
          {label}
        </Label>
        <p id={`${id}-hint`} className="text-muted-foreground text-xs">
          {hint}
        </p>
      </div>
      <div className="relative z-10 flex shrink-0 items-center gap-3">
        {action}
        <span className="pointer-events-none relative inline-flex">
          <span
            aria-hidden="true"
            className={cn(
              "bg-muted-foreground/30 group-has-[:checked]:bg-primary group-has-[:focus-visible]:ring-ring h-6 w-11 rounded-full transition-colors group-has-[:focus-visible]:ring-2",
              disabled && "opacity-50"
            )}
          />
          <span
            aria-hidden="true"
            className="bg-background absolute top-0.5 left-0.5 size-5 rounded-full shadow transition-transform group-has-[:checked]:translate-x-5"
          />
        </span>
      </div>
    </div>
  );
}

type NotificationState = "default" | "granted" | "denied" | "unsupported";

function subscribeToFocus(callback: () => void) {
  window.addEventListener("focus", callback);

  let cancelled = false;
  let status: PermissionStatus | undefined;
  navigator.permissions
    ?.query({ name: "notifications" })
    .then((result) => {
      if (cancelled) return;
      status = result;
      result.addEventListener("change", callback);
    })
    .catch(() => {});

  return () => {
    cancelled = true;
    window.removeEventListener("focus", callback);
    status?.removeEventListener("change", callback);
  };
}

function readNotificationState(): NotificationState {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

function useNotificationState(): NotificationState {
  return useSyncExternalStore(subscribeToFocus, readNotificationState, () => "default");
}

export function TimerSettingsCard({
  saved,
  draft,
  onDraftChange,
  onSave,
  isSaving,
  prefs,
  onPrefsChange,
  durationsLockedBy = null,
}: TimerSettingsCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<DurationField, boolean>>>({});
  const [typed, setTyped] = useState<Partial<Record<DurationField, string>>>({});
  const notificationState = useNotificationState();

  const hasInvalid = DURATION_FIELDS.some(({ field }) => !isValid(field, draft[field]));
  const isDirty = DURATION_FIELDS.some(({ field }) => draft[field] !== saved[field]);
  const locked = durationsLockedBy !== null;
  const anyBlank = DURATION_FIELDS.some(({ field }) => typed[field] === "");
  const notificationsBlocked =
    notificationState === "denied" || notificationState === "unsupported";

  function toggleHint(key: (typeof BEHAVIOR_TOGGLES)[number]["key"], hint: string) {
    if (key !== "notificationsEnabled" || !notificationsBlocked) return hint;
    return notificationState === "denied"
      ? "Blocked in your browser settings"
      : "Not supported in this browser";
  }

  return (
    <Card className="border-border/70 bg-background/85 rounded-3xl shadow-none">
      <CardHeader className="gap-0">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={isOpen ? "timer-settings-panel" : undefined}
          onClick={() => setIsOpen((value) => !value)}
          className="focus-visible:ring-ring flex min-h-11 w-full items-center justify-between gap-2 rounded-md text-left focus-visible:ring-2 focus-visible:outline-none"
        >
          <span className="flex items-start gap-2">
            <Settings2 aria-hidden="true" className="text-muted-foreground mt-0.5 size-4" />
            <span>
              <span className="block text-base leading-none font-semibold">Timer settings</span>
              {locked ? (
                <span className="text-muted-foreground block text-xs">
                  Durations locked by host
                </span>
              ) : null}
            </span>
          </span>
          <span className="text-muted-foreground flex items-center gap-1 text-sm">
            {isOpen ? "Collapse" : "Expand"}
            <ChevronDown
              aria-hidden="true"
              className={cn("size-4 transition-transform", isOpen && "rotate-180")}
            />
          </span>
        </button>
      </CardHeader>

      {isOpen ? (
        <CardContent id="timer-settings-panel" className="space-y-8">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!locked && !isSaving && isDirty && !hasInvalid) onSave();
            }}
          >
            <fieldset
              className="flex flex-col gap-4"
              disabled={locked}
              aria-describedby={locked ? "timer-durations-note" : undefined}
            >
              <legend className="mb-3 text-sm font-semibold">Durations</legend>
              {locked ? (
                <p id="timer-durations-note" className="text-muted-foreground text-xs">
                  Only the host ({durationsLockedBy}) can change timer settings during a shared
                  session.
                </p>
              ) : null}
              <div className="grid grid-cols-3 gap-3">
                {DURATION_FIELDS.map(({ field, label, id }) => {
                  const { min, max } = DURATION_LIMITS[field];
                  const invalid = !isValid(field, draft[field]);
                  const clearing = typed[field] === "";
                  const showError =
                    invalid &&
                    !clearing &&
                    (touched[field] === true || draft[field] !== saved[field]);

                  return (
                    <div key={field} className="space-y-2">
                      <Label htmlFor={id}>{label}</Label>
                      <div className="relative">
                        <Input
                          id={id}
                          type="number"
                          inputMode="numeric"
                          min={min}
                          max={max}
                          value={typed[field] ?? String(draft[field])}
                          aria-invalid={showError}
                          aria-describedby={`${id}-hint`}
                          className="h-11 [appearance:textfield] pr-10 text-base font-semibold tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          onChange={(event) => {
                            const raw = event.target.value;
                            setTyped((previous) => ({ ...previous, [field]: raw }));
                            onDraftChange(field, raw === "" ? 0 : Number(raw));
                          }}
                          onBlur={() => {
                            setTouched((previous) => ({ ...previous, [field]: true }));
                            setTyped((previous) => {
                              const next = { ...previous };
                              delete next[field];
                              return next;
                            });
                          }}
                        />
                        <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs">
                          min
                        </span>
                      </div>
                      {showError ? (
                        <p id={`${id}-hint`} role="alert" className="text-destructive text-xs">
                          Use {min}–{max}
                        </p>
                      ) : (
                        <p id={`${id}-hint`} className="text-muted-foreground text-xs">
                          {min}–{max} min
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              {locked ? null : (
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="submit"
                    className="min-h-11"
                    disabled={isSaving || !isDirty || hasInvalid}
                  >
                    {isSaving ? "Saving..." : "Save changes"}
                  </Button>
                  <span role="status" className="text-muted-foreground text-xs">
                    {anyBlank
                      ? "Enter a number to save"
                      : hasInvalid
                        ? "Fix the highlighted fields to save"
                        : isDirty && !isSaving
                          ? "Unsaved changes"
                          : ""}
                  </span>
                </div>
              )}
            </fieldset>
          </form>

          <fieldset>
            <legend className="text-sm font-semibold">Behavior</legend>
            <div className="divide-border/60 -mb-3 divide-y">
              {BEHAVIOR_TOGGLES.map(({ key, label, hint }) => (
                <Toggle
                  key={key}
                  id={`timer-${key}`}
                  label={label}
                  hint={toggleHint(key, hint)}
                  checked={prefs[key]}
                  disabled={
                    key === "notificationsEnabled" &&
                    notificationsBlocked &&
                    !prefs.notificationsEnabled
                  }
                  onChange={(checked) => onPrefsChange({ [key]: checked })}
                  action={
                    key === "soundEnabled" ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-h-11"
                        onClick={() => void playCompletionTone()}
                      >
                        Test sound
                      </Button>
                    ) : undefined
                  }
                />
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-3 text-sm font-semibold">Appearance</legend>
            <div className="grid grid-cols-2 gap-3">
              {COLOR_FIELDS.map(({ id, label, key }) => (
                <div key={id} className="flex items-center gap-3">
                  <Input
                    id={id}
                    type="color"
                    value={prefs[key]}
                    onChange={(event) => onPrefsChange({ [key]: event.target.value })}
                    className="size-11 shrink-0 cursor-pointer rounded-full border-0 p-0 [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
                  />
                  <div className="min-w-0">
                    <Label htmlFor={id}>{label}</Label>
                    <p className="text-muted-foreground text-xs uppercase">{prefs[key]}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-1">
              <div
                aria-hidden="true"
                className="h-2 rounded-full"
                style={{
                  backgroundImage: `linear-gradient(to right, ${prefs.focusColor}, ${prefs.breakColor})`,
                }}
              />
              <p className="text-muted-foreground text-xs">Preview: focus to break</p>
            </div>
            <Toggle
              id="timer-interpolate"
              label="Blend colors as time runs down"
              hint="Fade from the focus color toward the break color"
              checked={prefs.interpolatePhaseColors}
              onChange={(checked) => onPrefsChange({ interpolatePhaseColors: checked })}
            />
          </fieldset>
        </CardContent>
      ) : null}
    </Card>
  );
}
