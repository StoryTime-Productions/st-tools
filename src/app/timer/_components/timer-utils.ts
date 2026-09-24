import type { PomodoroStatsSnapshot } from "@/lib/pomodoro";
import type { TimerPhase } from "@/stores/timer-store";

export function formatClock(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${secs}`;
}

export function phaseLabel(phase: TimerPhase): string {
  if (phase === "work") {
    return "Focus";
  }

  if (phase === "shortBreak") {
    return "Short break";
  }

  return "Long break";
}

export function isBreakPhase(phase: TimerPhase): boolean {
  return phase === "shortBreak" || phase === "longBreak";
}

export function clampDurationInput(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, Math.round(value)));
}

export function getDisplayName(name: string | null, email: string): string {
  return name?.trim() || email;
}

export function initialsFromName(name: string | null, email: string): string {
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

export function normalizeHexColor(value: string | null | undefined, fallback: string): string {
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

export function mixHexColors(fromHex: string, toHex: string, ratio: number): string {
  const clampedRatio = Math.max(0, Math.min(1, ratio));
  const from = hexToRgb(fromHex);
  const to = hexToRgb(toHex);

  return rgbToHex({
    r: from.r + (to.r - from.r) * clampedRatio,
    g: from.g + (to.g - from.g) * clampedRatio,
    b: from.b + (to.b - from.b) * clampedRatio,
  });
}

export function toRgba(hexColor: string, alpha: number): string {
  const color = hexToRgb(hexColor);
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${Math.max(0, Math.min(1, alpha))})`;
}

export function incrementStats(previous: PomodoroStatsSnapshot): PomodoroStatsSnapshot {
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

export const DURATION_LIMITS = {
  workMinutes: { min: 1, max: 90 },
  shortBreakMinutes: { min: 1, max: 30 },
  longBreakMinutes: { min: 5, max: 60 },
} as const;

function linearChannel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

export function readableTextColor(backgroundHex: string): string {
  const { r, g, b } = hexToRgb(backgroundHex);
  const luminance =
    0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) + 0.0722 * linearChannel(b);
  const darkTextLuminance = 0.0056;
  const contrastWithDark = (luminance + 0.05) / (darkTextLuminance + 0.05);
  const contrastWithWhite = 1.05 / (luminance + 0.05);

  return contrastWithDark >= contrastWithWhite ? "#111111" : "#ffffff";
}
