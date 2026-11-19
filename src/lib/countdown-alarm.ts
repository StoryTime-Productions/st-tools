// Pure alarm and tab-title rules for countdowns. No browser or database access.
import { hasReached, pickTitleCountdown } from "@/lib/countdown-core";

export interface AlarmCountdown {
  id: string;
  title: string;
  targetAt: Date;
  dismissed: boolean;
}

/** Fired and not yet acknowledged by this user, oldest first. */
export function dueAlarms(list: AlarmCountdown[], now: Date) {
  return list
    .filter((c) => hasReached(c.targetAt, now) && !c.dismissed)
    .sort((a, b) => a.targetAt.getTime() - b.targetAt.getTime());
}

/** Only an alarm that fired while this tab was open rings; one found already fired stays silent. */
export function shouldRing(c: Pick<AlarmCountdown, "targetAt">, openedAt: Date) {
  return c.targetAt.getTime() >= openedAt.getTime();
}

/** "2h 05m", "12m", "<1m" for the tab title. */
export function shortRemaining(targetAt: Date, now: Date) {
  const minutes = Math.floor((targetAt.getTime() - now.getTime()) / 60_000);
  if (minutes >= 60)
    return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
  return minutes >= 1 ? `${minutes}m` : "<1m";
}

/**
 * The tab title: "Now · title" for the oldest unacknowledged alarm, else "2h 05m · title" for the soonest
 * countdown within 24 h, else null.
 */
export function countdownTabTitle(list: AlarmCountdown[], now: Date) {
  const pick = pickTitleCountdown(
    list.map((c) => ({ ...c, applies: true })),
    now
  );
  if (!pick) return null;
  const { countdown, reached } = pick;
  return `${reached ? "Now" : shortRemaining(countdown.targetAt, now)} · ${countdown.title}`;
}

/** Milliseconds until the clock needs to re-read: the next minute, or sooner if a target is closer. */
export function nextTickMs(list: Pick<AlarmCountdown, "targetAt">[], now: Date) {
  const soonest = list
    .filter((c) => !hasReached(c.targetAt, now))
    .reduce((min, c) => Math.min(min, c.targetAt.getTime() - now.getTime()), 60_000);
  return Math.max(250, Math.min(soonest + 50, 60_000 - (now.getTime() % 60_000) + 50));
}
