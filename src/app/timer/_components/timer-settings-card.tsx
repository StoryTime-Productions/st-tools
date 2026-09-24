"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
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

function isValid(field: DurationField, value: number) {
  const { min, max } = DURATION_LIMITS[field];
  return Number.isInteger(value) && value >= min && value <= max;
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
          <CardTitle className="text-base">Timer settings</CardTitle>
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
        <CardContent id="timer-settings-panel" className="space-y-6">
          <fieldset className="space-y-3">
            <legend className="mb-2 text-xs font-medium tracking-[0.2em] uppercase">
              Durations
            </legend>
            <div className="grid gap-4 sm:grid-cols-3">
              {DURATION_FIELDS.map(({ field, label, id }) => {
                const { min, max } = DURATION_LIMITS[field];
                const showError = touched[field] === true && !isValid(field, draft[field]);

                return (
                  <div key={field} className="space-y-1.5">
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
                        className="pr-12"
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

          <fieldset className="space-y-3">
            <legend className="text-xs font-medium tracking-[0.2em] uppercase">Behavior</legend>
            <p className="text-muted-foreground text-xs">Applies immediately</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-3 rounded-xl border px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={prefs.autoStartBreaks}
                  onChange={(event) => onPrefsChange({ autoStartBreaks: event.target.checked })}
                  className="size-4"
                />
                Auto-start breaks
              </label>
              <label className="flex items-center gap-3 rounded-xl border px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={prefs.autoStartFocus}
                  onChange={(event) => onPrefsChange({ autoStartFocus: event.target.checked })}
                  className="size-4"
                />
                Auto-start focus
              </label>
              <label className="flex items-center gap-3 rounded-xl border px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={prefs.soundEnabled}
                  onChange={(event) => onPrefsChange({ soundEnabled: event.target.checked })}
                  className="size-4"
                />
                Sound cues
              </label>
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-xs font-medium tracking-[0.2em] uppercase">Appearance</legend>
            <p className="text-muted-foreground text-xs">Applies immediately</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="timer-focus-color">Focus color</Label>
                <Input
                  id="timer-focus-color"
                  type="color"
                  value={prefs.focusColor}
                  onChange={(event) => onPrefsChange({ focusColor: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="timer-break-color">Break color</Label>
                <Input
                  id="timer-break-color"
                  type="color"
                  value={prefs.breakColor}
                  onChange={(event) => onPrefsChange({ breakColor: event.target.value })}
                />
              </div>
            </div>
            <label className="flex items-center gap-3 rounded-xl border px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={prefs.interpolatePhaseColors}
                onChange={(event) =>
                  onPrefsChange({ interpolatePhaseColors: event.target.checked })
                }
                className="size-4"
              />
              Blend colors as time runs down
            </label>
          </fieldset>
        </CardContent>
      ) : null}
    </Card>
  );
}
