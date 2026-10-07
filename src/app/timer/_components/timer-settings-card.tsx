"use client";

import { useState } from "react";
import { ChevronDown, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
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
}

interface TimerSettingsCardProps {
  saved: Durations;
  draft: Durations;
  onDraftChange: (field: DurationField, value: number) => void;
  onSave: () => void;
  isSaving: boolean;
  prefs: TimerPrefs;
  onPrefsChange: (patch: Partial<TimerPrefs>) => void;
}

const DURATION_FIELDS: { field: DurationField; label: string; id: string }[] = [
  { field: "workMinutes", label: "Work", id: "timer-work-minutes" },
  { field: "shortBreakMinutes", label: "Short break", id: "timer-short-break-minutes" },
  { field: "longBreakMinutes", label: "Long break", id: "timer-long-break-minutes" },
];

const BEHAVIOR_TOGGLES: {
  key: "autoStartBreaks" | "autoStartFocus" | "soundEnabled";
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
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p id={`${id}-hint`} className="text-muted-foreground text-xs">
          {hint}
        </p>
      </div>
      <span className="relative inline-flex shrink-0">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          aria-describedby={`${id}-hint`}
          onChange={(event) => onChange(event.target.checked)}
          className="peer absolute inset-0 z-10 m-0 cursor-pointer opacity-0"
        />
        <span
          aria-hidden="true"
          className="bg-muted-foreground/30 peer-checked:bg-primary peer-focus-visible:ring-ring h-6 w-11 rounded-full transition-colors peer-focus-visible:ring-2"
        />
        <span
          aria-hidden="true"
          className="bg-background pointer-events-none absolute top-0.5 left-0.5 size-5 rounded-full shadow transition-transform peer-checked:translate-x-5"
        />
      </span>
    </div>
  );
}

export function TimerSettingsCard({
  saved,
  draft,
  onDraftChange,
  onSave,
  isSaving,
  prefs,
  onPrefsChange,
}: TimerSettingsCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<DurationField, boolean>>>({});

  const hasInvalid = DURATION_FIELDS.some(({ field }) => !isValid(field, draft[field]));
  const isDirty = DURATION_FIELDS.some(({ field }) => draft[field] !== saved[field]);

  return (
    <Card className="border-border/70 bg-background/85 rounded-3xl shadow-none">
      <CardHeader>
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls="timer-settings-panel"
          onClick={() => setIsOpen((value) => !value)}
          className="focus-visible:ring-ring flex w-full items-center justify-between gap-2 rounded-md text-left focus-visible:ring-2 focus-visible:outline-none"
        >
          <span className="flex items-center gap-2">
            <Settings2 aria-hidden="true" className="text-muted-foreground size-4" />
            <CardTitle className="text-base">Timer settings</CardTitle>
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
          <fieldset className="space-y-4">
            <legend className="mb-3 text-sm font-semibold">Durations</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {DURATION_FIELDS.map(({ field, label, id }) => {
                const { min, max } = DURATION_LIMITS[field];
                const showError = touched[field] === true && !isValid(field, draft[field]);

                return (
                  <div key={field} className="bg-muted/30 space-y-2 rounded-2xl border p-3">
                    <Label htmlFor={id}>{label}</Label>
                    <div className="relative">
                      <Input
                        id={id}
                        type="number"
                        inputMode="numeric"
                        min={min}
                        max={max}
                        value={draft[field]}
                        aria-invalid={showError}
                        aria-describedby={`${id}-hint`}
                        className="h-11 pr-12 text-lg font-semibold tabular-nums"
                        onChange={(event) => {
                          onDraftChange(field, Number.parseInt(event.target.value, 10) || 0);
                        }}
                        onBlur={() => setTouched((previous) => ({ ...previous, [field]: true }))}
                      />
                      <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm">
                        min
                      </span>
                    </div>
                    <p
                      id={`${id}-hint`}
                      className={cn(
                        "text-xs",
                        showError ? "text-destructive" : "text-muted-foreground"
                      )}
                    >
                      {showError ? `Must be ${min}–${max} min` : `${min}–${max} min`}
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-3">
              <Button type="button" onClick={onSave} disabled={isSaving || !isDirty || hasInvalid}>
                {isSaving ? "Saving..." : "Save changes"}
              </Button>
              {isDirty && !isSaving ? (
                <span className="text-muted-foreground text-xs">Unsaved changes</span>
              ) : null}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold">Behavior</legend>
            <p className="text-muted-foreground mb-1 text-xs">Applies immediately</p>
            <div className="divide-border/60 divide-y">
              {BEHAVIOR_TOGGLES.map(({ key, label, hint }) => (
                <Toggle
                  key={key}
                  id={`timer-${key}`}
                  label={label}
                  hint={hint}
                  checked={prefs[key]}
                  onChange={(checked) => onPrefsChange({ [key]: checked })}
                />
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">Appearance</legend>
            <p className="text-muted-foreground text-xs">Applies immediately</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {COLOR_FIELDS.map(({ id, label, key }) => (
                <div
                  key={id}
                  className="bg-muted/30 flex items-center gap-3 rounded-2xl border p-3"
                >
                  <Input
                    id={id}
                    type="color"
                    value={prefs[key]}
                    onChange={(event) => onPrefsChange({ [key]: event.target.value })}
                    className="size-10 shrink-0 cursor-pointer rounded-full border-0 p-0 [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
                  />
                  <div className="min-w-0">
                    <Label htmlFor={id}>{label}</Label>
                    <p className="text-muted-foreground text-xs uppercase">{prefs[key]}</p>
                  </div>
                </div>
              ))}
            </div>
            <div
              aria-hidden="true"
              className="h-2 rounded-full"
              style={{
                backgroundImage: `linear-gradient(to right, ${prefs.focusColor}, ${prefs.breakColor})`,
              }}
            />
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
