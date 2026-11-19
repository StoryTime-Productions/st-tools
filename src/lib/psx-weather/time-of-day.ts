export type TimeOfDay = {
  isDay: boolean;
  /** 0..1 along the sun's arc (day) or the moon's arc (night) */
  p: number;
  /** solar altitude proxy, -1 (deep night) .. 1 (noon) */
  alt: number;
};

/** 06:30 and 16:45, used only when the weather response has no sunrise/sunset */
export const FALLBACK_SUNRISE = 390;
export const FALLBACK_SUNSET = 1005;

const DAY_MINUTES = 1440;

/** minutes since local midnight -> where the sun or moon is */
export function todFromMinutes(
  minutes: number,
  sunrise = FALLBACK_SUNRISE,
  sunset = FALLBACK_SUNSET
): TimeOfDay {
  const min = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  if (min >= sunrise && min <= sunset) {
    const p = (min - sunrise) / (sunset - sunrise);
    return { isDay: true, p, alt: Math.sin(Math.PI * p) };
  }
  const intoNight = min > sunset ? min - sunset : min + DAY_MINUTES - sunset;
  const p = intoNight / (DAY_MINUTES - (sunset - sunrise));
  return { isDay: false, p, alt: -Math.sin(Math.PI * p) };
}

/**
 * Minutes since midnight from an Open-Meteo local timestamp such as "2026-11-03T09:45".
 * The value is already in the weather location's timezone (`timezone=auto`), so the
 * viewer's own clock and timezone never enter into it.
 */
export function parseLocalMinutes(iso: unknown): number | null {
  if (typeof iso !== "string") return null;
  const match = /T(\d{2}):(\d{2})/.exec(iso);
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 23 || mins > 59) return null;
  return hours * 60 + mins;
}

/** the weather location's clock now: the local time at fetch plus the time elapsed since */
export function clockAt(localMinutesAtFetch: number, fetchedAt: number, now: number): number {
  const elapsed = Math.max(0, (now - fetchedAt) / 60000);
  return (localMinutesAtFetch + elapsed) % DAY_MINUTES;
}

/** "HH:MM" for the dev preview override; null when it is not a valid time */
export function parseClockText(text: string | null): number | null {
  if (!text) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 23 || mins > 59) return null;
  return hours * 60 + mins;
}
